// Feature keys a module can declare and gate itself behind (Charter §6.4:
// "A resolved set of module and feature keys available to a tenant at a point
// in time"). Every new tenant is placed on the TRIAL plan, which grants the
// 'finance' key — so the demo and existing tests keep working unchanged.

export const FEATURE_KEYS = {
  FINANCE: 'finance',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

// Seed data for the platform catalogue (Plan/PlanFeature). Written once by the
// owner DB role during seed/register — never by the restricted app role
// (see rls.sql).
export const SEED_PLANS: Record<string, readonly string[]> = {
  TRIAL: [FEATURE_KEYS.FINANCE],
};
