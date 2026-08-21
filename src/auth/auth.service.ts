// auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService, // reuse existing user logic
    private readonly jwtService: JwtService,       // provided by @nestjs/jwt, signs tokens
  ) {}

  async register(dto: RegisterDto) {
    // 1. Refuse duplicate emails
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    // 2. Create the user. No hashing here on purpose — the schema's pre('save')
    //    hook does it, so there is exactly one place that can get it wrong.
    const user = await this.usersService.create(dto);

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

  private signToken(user: any) {
    // "payload" = the data embedded inside the token, readable by anyone (not secret!)
    // never put the password in here — only identifying, non-sensitive info
    const payload = { sub: user._id, email: user.email, role: user.role };

    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    };
  }
}
