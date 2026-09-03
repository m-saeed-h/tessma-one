-- Row-Level Security setup. Applied AFTER tables exist (via `prisma migrate deploy`)
-- and AFTER the demo seed runs as the owner. Idempotent: safe to run repeatedly.
--
-- The application connects as the restricted role `tessma_app` (APP_DATABASE_URL).
-- RLS is enforced for that role. The owner role (used only for migrations/seed)
-- bypasses RLS, which is why seeding runs before this and the app never connects
-- as the owner.

-- 1. Restricted application role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tessma_app') THEN
    CREATE ROLE tessma_app LOGIN PASSWORD 'tessma_app';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO tessma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tessma_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tessma_app;

-- 1a. Append-only tables. BR-FIN-04 / FR-LED-006 / FR-AUD-002: an issued
-- ledger entry or audit event is immutable — correction is by reversal, never
-- by edit or delete. The application layer already never calls .update()/
-- .delete() on these, but Charter §6.2 wants the control "that survives an
-- application bug": revoke the privilege at the database grant, not just by
-- convention. INSERT (and SELECT) remain granted; UPDATE/DELETE do not.
REVOKE UPDATE, DELETE ON "AuditEvent", "LedgerEntry" FROM tessma_app;

-- 1b. Platform catalogue tables (Plan, PlanFeature, Partner): owned by the
-- Platform Operator, not by any tenant, and not self-service in this slice —
-- the app only ever reads them. Written by the owner role during seed/admin
-- operations only.
REVOKE INSERT, UPDATE, DELETE ON "Plan", "PlanFeature", "Partner" FROM tessma_app;

-- 2. Enable RLS + a tenant policy on every tenant-owned BUSINESS table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Party','CustomerRole','Product','Account',
    'Invoice','InvoiceLine','LedgerEntry','AuditEvent','NumberSequence',
    'Role','RolePermission','UserRole','TenantBranding','TenantSubscription'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING ("tenantId" = current_setting('app.current_tenant', true))
      WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));
    $f$, t);
  END LOOP;
END $$;

-- 3. User: a deliberate two-policy exception, not an omission.
--
-- Login must look a user up by email BEFORE any tenant is known — there is no
-- app.current_tenant to filter on yet. A single tenant_isolation policy (as
-- above) would make that lookup return nothing. Two separate policies give
-- the property we actually want: reads needed for authentication are allowed
-- across tenants (an email lookup, never a listing — the app code only ever
-- does findFirst-by-email here), while every WRITE stays hard-scoped to the
-- caller's own tenant context, so nothing can create or modify a User row
-- under a foreign tenant even if a bug or malicious input tried to.
--
-- Email is also globally unique at the schema level (see schema.prisma), so
-- the permissive read policy can never resolve ambiguously across tenants.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_read_for_auth ON "User";
DROP POLICY IF EXISTS user_write_tenant_scoped ON "User";
DROP POLICY IF EXISTS user_update_tenant_scoped ON "User";
DROP POLICY IF EXISTS user_delete_tenant_scoped ON "User";

CREATE POLICY user_read_for_auth ON "User"
  FOR SELECT
  USING (true);

CREATE POLICY user_write_tenant_scoped ON "User"
  FOR INSERT
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

CREATE POLICY user_update_tenant_scoped ON "User"
  FOR UPDATE
  USING ("tenantId" = current_setting('app.current_tenant', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant', true));

CREATE POLICY user_delete_tenant_scoped ON "User"
  FOR DELETE
  USING ("tenantId" = current_setting('app.current_tenant', true));

-- 4. Tenant and Partner are intentionally NOT row-level-secured: they are the
-- platform administration domain itself (Charter §6.1 — "there is no such
-- thing as an untenanted record outside the platform administration domain"),
-- not per-tenant business data. Tenant rows are created by /auth/register
-- (before any tenant context exists) and Partner rows are Platform-Operator
-- administration, not tenant self-service.
