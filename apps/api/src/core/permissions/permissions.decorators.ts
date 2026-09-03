import { SetMetadata } from '@nestjs/common';

// Mark a route as not requiring authentication (register, login, health).
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

// Require one or more permissions to reach a route. Deny by default: a guarded
// route with no grant is refused.
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
