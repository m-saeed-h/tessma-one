import { SetMetadata } from '@nestjs/common';

// Require a subscription feature key to reach a route. Analogous to
// @RequirePermissions, but a different axis: permissions ask "is this user
// allowed", entitlement asks "has this tenant paid for this capability".
export const ENTITLEMENT_KEY = 'requiredEntitlement';
export const RequireEntitlement = (featureKey: string) => SetMetadata(ENTITLEMENT_KEY, featureKey);
