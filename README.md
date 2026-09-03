# Tessma One — Foundation Slice (Stage 1)

A **runnable** starting point that proves the Tessma One architecture end-to-end on the
hardest module (Finance). It is deliberately thin but **not throwaway** — every part follows
the Charter, so you extend it rather than replace it.

**Stage 1 status: complete**, per the platform-foundation scope in the Charter and the
README's own Day-1 plan:

- Multi-tenancy with PostgreSQL row-level security, proven by an automated cross-tenant
  suite at both the data-access layer and over real HTTP requests.
- Identity: register/login, httpOnly-cookie sessions with CSRF protection, argon2 hashing.
- RBAC: roles, permissions (`module.resource.action`), deny-by-default global guards,
  system roles seeded per tenant, tested for both the allow and the deny path.
- Subscriptions & entitlements: a Plan/PlanFeature catalogue and a `TenantSubscription`,
  checked server-side on every gated route (`@RequireEntitlement`) — not just hidden in the UI.
- Partner tier foundation hooks: the `Partner` entity, `partnerId` on `Tenant`, a
  `TenantBranding` override table, and a branding-resolution chain (tenant override → partner
  theme → platform default) — the Charter's "decision that cannot wait" (§7.9), in the core
  before any partner-facing screen exists.
- Audit: append-only by database grant (not just by convention), with actor-type typing
  (`TENANT_USER` today; the column exists so a future partner-access feature needs no
  migration against live audit history).
- Shared platform services a module must not reinvent: the Party master, the audit writer,
  the branding resolver.
- Definition-of-done hygiene: server-side validation (Zod) on every mutating route, one error
  contract, `/health` + `/ready`, structured JSON logs, graceful shutdown, a real Prisma
  migration history (not `db push`), and a CI pipeline that runs all of the above on every
  push.

Not yet built — genuinely still Stage 1/2 work, not claimed as done: documents, notifications,
the workflow/approval engine, the AI Gateway interface, and the partner-facing console (the
last of these is explicitly Phase 3 per Charter §7.9).

**What the demo does:** log in → the app knows your company → create a customer (a *role* on
the shared Party) → raise an invoice with exact-penny maths (BigInt throughout — never a
floating-point cent) → **issue** it (allocates a gap-free number, posts a **balanced
double-entry** to the ledger, writes an audit record, and locks the invoice) → view a trial
balance that proves the books balance. Company data is kept apart at the database level by
PostgreSQL **row-level security**, with automated cross-tenant tests — one at the Prisma layer,
one driving the real HTTP API with cookies and CSRF tokens exactly as a browser would — that
fail the build if a leak ever slips through.

Stack, exactly per the docs: **NestJS + Next.js + PostgreSQL + Prisma + Docker**.

---

## Run it

You need Docker (with Docker Compose). One command:

```bash
cp .env.example .env
docker compose up --build
```

Then:
- API → http://localhost:4000
- Web → http://localhost:3000  (login: **demo@tessma.one** / **demo1234**)

On start the API container automatically: applies the migration history (`prisma migrate
deploy`), seeds the plan catalogue + demo tenant, then applies the row-level-security policies
(`prisma/rls.sql`, which also creates the restricted `tessma_app` role the app connects as).
Order matters — seeding runs as the owner before RLS is switched on, and the plan catalogue
must exist before `/auth/register` can subscribe a tenant to it. The whole sequence is
idempotent — safe to restart the container without a fresh volume.

### Run without Docker (two terminals)

```bash
# terminal 1 — database only
docker compose up db

# terminal 2 — API  (first time: migrate, seed, apply RLS)
npm install               # installs the whole workspace (api + web share one lockfile)
cd apps/api
npm run db:setup          # = prisma migrate deploy + seed + apply rls.sql
npm run start:dev

# terminal 3 — web
cd apps/web && npm run dev
```

---

## The 2-minute demo script (what to show)

1. **Log in** at /login → the API sets an httpOnly session cookie (never readable by page
   script) plus a separate, readable CSRF cookie the app echoes back on every mutation.
2. **Customers** → add "Acme Retail Ltd". It's created as a role on the shared **Party**, not a
   private customers table.
3. **Invoices** → *Create draft*: two lines, discount + VAT, computed to the exact penny —
   there is no `Number(x) * pct/100` anywhere in the money path.
4. *Issue*: watch the status flip to **ISSUED** with number **INV-00001**, and the **trial
   balance** appear — Debtors (debit) exactly equals Sales + Output VAT (credit).
5. **Prove isolation and correctness** (the money shot for a reviewer):
   ```bash
   cd apps/api
   npm test                            # exact-decimal money, including the specific
                                        # percentages (29%, 35%, 70%...) that break under float
   npm run test:rbac                   # RBAC: OWNER allowed, SALES_USER denied
   npm run test:e2e                    # cross-tenant isolation (Prisma layer AND real HTTP,
                                        # with cookies + CSRF) + append-only audit/ledger grants
   ```
   All three run in CI (`.github/workflows/ci.yml`) on every push.

---

## Where the important ideas live

| Idea | File |
|---|---|
| Company separation with pooling-safe RLS | `apps/api/src/shared/prisma/prisma.service.ts` (`forTenant`) |
| The database wall (RLS policies + restricted role, append-only grants) | `apps/api/prisma/rls.sql` |
| Real migration history | `apps/api/prisma/migrations/` |
| Tenant comes from the token only (cookie or header) | `apps/api/src/core/identity/auth.guard.ts` |
| CSRF protection on cookie-authenticated mutations | `apps/api/src/core/identity/csrf.guard.ts` |
| Exact-penny money — BigInt throughout, no float in the path | `apps/api/src/shared/money/money.ts` |
| Balanced double-entry posting + immutability | `apps/api/src/modules/finance/finance.service.ts` (`issue`) |
| Append-only audit, with actor typing for future partner access | `apps/api/src/core/audit/audit.service.ts` |
| Cross-tenant build-blockers (three angles) | `apps/api/test/cross-tenant.e2e-spec.ts`, `test/http-cross-tenant.e2e-spec.ts`, `test/append-only.e2e-spec.ts` |
| Permissions registry + system roles | `apps/api/src/core/permissions/permissions.registry.ts` |
| Subscriptions & entitlements (server-side gate) | `apps/api/src/core/subscriptions/entitlements.service.ts`, `entitlements.guard.ts` |
| Branding resolution chain (Charter §7.4) | `apps/api/src/core/branding/branding.service.ts` |
| Partner + branding + audit-actor-typing data model (Charter §7.9 "cannot wait") | `apps/api/prisma/schema.prisma` |
| One error contract, no leaked internals | `apps/api/src/shared/errors/http-exception.filter.ts` |
| Server-side validation on every mutating route | `apps/api/src/shared/validation/` |
| Data model (tenantId on every table) | `apps/api/prisma/schema.prisma` |

---

## Your next 4 days (this scaffold is Stage 1 done)

- **Day 2 — Deepen Party + products.** Add supplier role, product catalogue with VAT
  treatment, the customer account view. Add RLS + cross-tenant tests for every new table.
- **Day 3 — Deepen the invoice + ledger.** Credit notes (reversing postings), payments &
  allocation, aged receivables. Keep every posting balanced and every issued doc immutable.
- **Day 4 — Platform services.** Documents (object storage abstraction), notifications, the
  approval/workflow engine, the AI Gateway interface — all of these are genuinely still to
  build; don't let a module reimplement any of them privately (Charter §2.2).
- **Day 5 — Prove + polish.** Extend CI coverage as you add tables, tidy the screens, record
  the 2-minute demo, write your notes.

**If you fall behind, cut in this order:** UI polish → products → multi-line invoices.
**Never cut:** tenancy/RLS, balanced ledger posting, exact-decimal money, immutability, CSRF
on mutations, server-side validation.

---

## Important notes / honest caveats

- This is a **foundation slice**, not the platform. Documents, notifications, the workflow
  engine, and the AI Gateway are not built. The partner-facing console is deliberately not
  built either — Charter §7.9 places it in Phase 3; what *is* built (Partner entity,
  `partnerId`, branding resolution, audit actor typing) is exactly what the Charter says
  cannot wait.
- The RLS pattern here (transaction-local `set_config`) is the **spike the Charter demands**,
  solved. Read `prisma.service.ts` — it's the single most important file to understand.
- `User` carries two RLS policies rather than one, and is documented inline in `rls.sql`:
  reads needed for pre-authentication email lookup are permissive, writes are hard-scoped to
  the caller's own tenant. Email is also globally unique at the schema level, so that read
  can never resolve ambiguously across tenants.
- Money is integer pence throughout, computed with exact BigInt arithmetic (no
  `Number(x) * pct / 100` anywhere — that silently mis-rounds specific percentages, e.g. 29%
  of £5.00), serialised to strings over JSON so nothing is lost.
- Sessions are httpOnly cookies with a double-submit CSRF token, not a bearer token in
  `localStorage` — page script never touches the access token. A bearer `Authorization`
  header still works for machine/API clients and is exempt from the CSRF check (it isn't
  automatically replayable by a third-party page the way a cookie is).
- `apps/web`'s Next.js is pinned to the latest 14.2.x patch (not the 16.x line) to avoid an
  unvalidated major-version jump in this pass. `npm audit` still reports two Next.js/PostCSS
  advisories whose fix requires Next 16, which changes core App Router APIs (e.g. `cookies()`
  becomes async) — upgrading is a deliberate follow-up, not a `--force` in CI.
- Before production: move secrets to a real secret store, add refresh-token rotation (today's
  session is a single 12h access token, not a rotating pair), rate limiting on
  auth/export/report endpoints, and the Next 16 upgrade above.
