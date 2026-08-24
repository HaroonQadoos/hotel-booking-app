import { SetMetadata } from '@nestjs/common';
import { Role } from '../types/role';

export const ROLES_KEY = 'roles';

// Marks a route as requiring one of the listed roles. Inert on its own —
// RolesGuard is what reads this metadata, so the two are always used together.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
