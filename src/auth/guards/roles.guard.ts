import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../types/auth-user';
import { Role } from '../types/role';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles on the route means no role restriction. Authentication is
    // JwtAuthGuard's job, not ours.
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    // Defensive: reaching here without a user means @Roles was used without
    // JwtAuthGuard in front of it. Deny rather than read role off undefined.
    if (!user) throw new ForbiddenException('Insufficient permissions');

    if (!required.includes(user.role as Role)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
