// auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/schemas/user.schema';
import { EmailVerificationPayload, JwtPayload } from './types/auth-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly usersService: UsersService, // reuse existing user logic
    private readonly jwtService: JwtService, // provided by @nestjs/jwt, signs tokens
    private readonly mailService: MailService,
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
