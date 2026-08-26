// auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/schemas/user.schema';
import { EmailVerificationPayload, JwtPayload } from './types/auth-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { generateResetToken, hashResetToken } from './reset-token';
import { MailService } from '../mail/mail.service';

// Deliberately says nothing about whether the address is registered. Returned
// on both branches of forgotPassword — see the comment there.
const RESET_REQUESTED_MESSAGE =
  'If that email is registered, a reset link has been sent.';

const DEFAULT_RESET_EXPIRES_IN_MINUTES = '15';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly usersService: UsersService, // reuse existing user logic
    private readonly jwtService: JwtService, // provided by @nestjs/jwt, signs tokens
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Refuse duplicate emails
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    // 2. Create the user. No hashing here on purpose — the schema's pre('save')
    //    hook does it, so there is exactly one place that can get it wrong.
    const user = await this.usersService.create(dto);
    // Fire-and-forget: a flaky mail server should never fail registration.
    // The user can always hit a "resend verification" endpoint later.
    this.sendVerificationEmail(user).catch((err) =>
      this.logger.error(
        `Failed to send verification email to ${user.email}`,
        err,
      ),
    );

    // 3. Immediately issue a token, so registering also logs you in
    return this.signToken(user);
  }

  async login(dto: LoginDto) {
    // 1. Find the user, explicitly pulling in the normally-hidden hash
    const user = await this.usersService.findByEmailWithPassword(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // 2. Compare the plaintext password they sent against the stored hash
    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    // 3. Issue a token
    return this.signToken(user);
  }

  async sendVerificationEmail(user: User) {
    const payload: EmailVerificationPayload = { sub: String(user._id) };

    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_VERIFICATION_SECRET,
      // expiresIn is typed as ms's StringValue union ('24h', '7d', ...), not a
      // plain string, so an env var has to be asserted back into that shape.
      expiresIn: (process.env.JWT_VERIFICATION_EXPIRES_IN ??
        '24h') as JwtSignOptions['expiresIn'],
    });

    await this.mailService.sendVerificationEmail(user.email, token);
  }

  async verifyEmail(token: string) {
    let payload: EmailVerificationPayload;

    try {
      payload = this.jwtService.verify<EmailVerificationPayload>(token, {
        secret: process.env.JWT_VERIFICATION_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    const user = await this.usersService.findOne(payload.sub);
    if (user.isEmailVerified) {
      return { message: 'Email already verified' };
    }

    await this.usersService.markEmailAsVerified(payload.sub);
    return { message: 'Email verified successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // An unknown address takes the silent branch: nothing written, nothing
    // sent. Both branches return the same message below, because a 404 here
    // would turn this endpoint into a way to test which addresses have
    // accounts.
    if (user) {
      const rawToken = generateResetToken();
      const expiresAt = new Date(Date.now() + this.resetTokenLifetimeMs());

      await this.usersService.setResetToken(
        String(user._id),
        hashResetToken(rawToken),
        expiresAt,
      );

      // Caught rather than propagated: a dead mail server must not change the
      // response, or the difference becomes the oracle the generic message
      // exists to prevent. The token is already stored, so a resend works.
      try {
        await this.mailService.sendPasswordResetEmail(user.email, rawToken);
      } catch (err) {
        this.logger.error(
          `Failed to send password reset email to ${user.email}`,
          err,
        );
      }
    }

    return { message: RESET_REQUESTED_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    // Only the digest was ever stored, so the submitted token is hashed and
    // matched against that. Forged, expired and already-spent tokens all land
    // here as "no user" — the caller cannot tell them apart, and neither
    // should an attacker.
    const user = await this.usersService.findByResetTokenHash(
      hashResetToken(dto.token),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }

    await this.usersService.replacePassword(user, dto.newPassword);

    // No token issued on purpose: signing the user in here would make a
    // stolen link strictly more valuable than it needs to be.
    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findByIdWithPassword(userId);
    // The JWT outlives the record it names, so the account may be gone.
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Proving knowledge of the current password is what stops a borrowed
    // laptop with a live session from locking the real owner out.
    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isSame = await bcrypt.compare(dto.newPassword, user.password);
    if (isSame) {
      throw new BadRequestException(
        'New password must be different from the current one',
      );
    }

    await this.usersService.replacePassword(user, dto.newPassword);

    return { message: 'Password changed successfully' };
  }

  private resetTokenLifetimeMs(): number {
    const minutes = Number(
      this.config.get<string>(
        'PASSWORD_RESET_EXPIRES_IN',
        DEFAULT_RESET_EXPIRES_IN_MINUTES,
      ),
    );

    // A misconfigured value must not silently produce a token that never
    // expires (NaN) or one already expired.
    if (!Number.isFinite(minutes) || minutes <= 0) {
      this.logger.warn(
        `Ignoring invalid PASSWORD_RESET_EXPIRES_IN — using ${DEFAULT_RESET_EXPIRES_IN_MINUTES} minutes`,
      );
      return Number(DEFAULT_RESET_EXPIRES_IN_MINUTES) * 60_000;
    }

    return minutes * 60_000;
  }

  private signToken(user: User) {
    // Typed as JwtPayload so signing here and verifying in JwtStrategy are held
    // to one shape — change a claim here and validate() stops compiling.
    // "payload" = the data embedded inside the token, readable by anyone (not secret!)
    // never put the password in here — only identifying, non-sensitive info
    const id = String(user._id);
    const payload: JwtPayload = { sub: id, email: user.email, role: user.role };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
