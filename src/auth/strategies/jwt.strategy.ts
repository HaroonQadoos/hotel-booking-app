// auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthUser, JwtPayload } from '../types/auth-user';
import { AUTH_COOKIE } from '../cookie';

// Browsers hold the token in an httpOnly cookie and attach it automatically,
// so there is no Authorization header to read on a request from the SPA.
function fromAuthCookie(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[AUTH_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      // Cookie first, header second: the browser uses the cookie, while
      // curl, Postman and any future service token keep working via
      // "Authorization: Bearer <token>".
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAuthCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false, // reject expired tokens automatically
      secretOrKey: configService.getOrThrow<string>('AUTH_SECRET'), // must match the secret used to SIGN tokens
    });
  }

  // The declared AuthUser return type is what keeps @CurrentUser() honest —
  // change the shape here and every consumer stops compiling.
  // Not async: nothing here awaits anything. Passport accepts a plain return.
  validate(payload: JwtPayload): AuthUser {
    // payload = whatever AuthService put in the token (sub, email, role)
    // this return value becomes req.user in any guarded controller method
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
