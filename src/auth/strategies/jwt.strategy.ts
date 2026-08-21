// auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // look for "Authorization: Bearer <token>"
      ignoreExpiration: false,                                   // reject expired tokens automatically
      secretOrKey: configService.getOrThrow<string>('AUTH_SECRET'), // must match the secret used to SIGN tokens
    });
  }

  async validate(payload: any) {
    // payload = whatever AuthService put in the token (sub, email, role)
    // this return value becomes req.user in any guarded controller method
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}