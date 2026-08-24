// auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser, JwtPayload } from '../types/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // look for "Authorization: Bearer <token>"
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
