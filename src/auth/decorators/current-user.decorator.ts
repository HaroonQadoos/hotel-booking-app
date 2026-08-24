import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../types/auth-user';

// Typed replacement for @Req() req — the handler gets AuthUser instead of an
// untyped request, so a misspelled field is a compile error, not a runtime
// undefined. Only meaningful on routes behind JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
