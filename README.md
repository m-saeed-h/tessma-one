# Tessma One — Foundation Slice (Stage 1) + Finance MVP (Stage 2, partial)

A **runnable** starting point that proves the Tessma One architecture end-to-end on the
hardest module (Finance). It is deliberately thin but **not throwaway** — every part follows
the Charter, so you extend it rather than replace it.

**Stage 1 status: complete** — the full platform-foundation scope in Charter §5.2 and the
Build Guide's Stage 1 list, not a subset of it:

- Multi-tenancy with PostgreSQL row-level security, proven by automated cross-tenant suites at
  the data-access layer, over real HTTP requests, and against the append-only grants directly.
- Identity: register/login, httpOnly-cookie sessions with double-submit CSRF protection, argon2
  hashing.
- RBAC: roles, permissions (`module.resource.action`), deny-by-default global guards, system
  roles seeded per tenant, tested for both the allow and the deny path.
- Subscriptions & entitlements: a Plan/PlanFeature catalogue and a `TenantSubscription`, checked
  server-side on every gated route (`@RequireEntitlement`) — not just hidden in the UI.
- Partner tier foundation hooks: the `Partner` entity, `partnerId` on `Tenant`, a
  `TenantBranding` override table, and a branding-resolution chain (tenant override → partner
  theme → platform default) — the Charter's "decision that cannot wait" (§7.9), consumed by the
  web app's own header instead of a hard-coded name/colour.
- **Documents**: an object-storage abstraction (S3-compatible — MinIO in dev) behind short-lived
  signed URLs. The API process never touches a file's bytes; the browser uploads/downloads
  straight to object storage.
- **Notifications**: in-app (fully wired — issuing an invoice notifies the issuer) and a
  dev-mode email transport, behind one provider-swappable interface covering all four channels
  the Charter names.
- **Workflow / approval engine**: a generic, tenant-configurable multi-step approval
  state machine (sequential steps, role-checked, self-approval blocked) that any module submits
  into by an opaque `subjectType` — nothing Finance-specific lives in it, per FR-APR-009.
- **AI Gateway**: the routing/redaction/metering/audit interface every module is meant to call
  instead of a provider directly, with a deterministic no-network dev provider so the plumbing
  (per-tenant kill switch, PII redaction, full audit trail) is provably correct without an
  external API key. Swapping in a real model is a provider implementation, not a rewrite.
- Audit: append-only by database grant (not just by convention), with actor-type typing
  (`TENANT_USER` today; the column exists so a future partner-access feature needs no migration
  against live audit history).
- **Design system**: Tailwind + a small shared component library (`components/ui.tsx`), with the
  brand colour injected as a CSS custom property from the resolved branding chain, not
  hard-coded. Every screen uses it, each with real loading/empty/error states.

**Stage 2 status: partial** — the invoice-to-cash cycle is real and tested; accounts payable,
banking, VAT/MTD and multi-currency are not (see "What Stage 2 does not cover" below):

- **Party, fully.** Company/individual fields, address, VAT/company number, notes — one shared
  Party master, exactly as Stage 1 established. A `SupplierRole` now sits alongside
  `CustomerRole`, with bank details **encrypted at the application level** (AES-256-GCM,
  SEC-DAT-03) and a re-authentication + audit + notification requirement to change them
  (FR-PTY-014). Duplicate-party detection (FR-PTY-008) is a real two-step API contract — a 409
  with candidates, resubmit with `confirmDuplicate: true` — not a fire-and-forget warning.
- **Products**, with type, VAT treatment, purchase price, and archiving that preserves history.
- **Full invoice lifecycle**: due dates derived from customer payment terms, cancellation with a
  mandatory reason that posts a reversing ledger entry (not a silent status flip), and a credit
  limit check at issue time — `WARN` proceeds with a flag, `BLOCK` refuses outright.
- **Quotations**, converting to a draft invoice only once accepted, with an explicit override
  required to convert an expired one.
- **Credit notes**, full or partial, always posting a reversing ledger entry. A standard credit
  reverses Sales; a `BAD_DEBT` credit posts to a dedicated bad-debt expense account instead —
  the sale happened, it's the collectability that failed, and the ledger says so.
- **Payments**: recording posts the cash receipt (Dr Bank / Cr Debtors) immediately, independent
  of allocation; allocation across one or more invoices caps at both the payment's unallocated
  balance and each invoice's outstanding balance, moving invoices through
  `PARTIALLY_PAID` → `PAID` as it goes.
- **Aged receivables report**, bucketed by days overdue relative to each invoice's due date,
  using outstanding (not original) balance.

### What Stage 2 does not cover yet

Accounts payable (supplier invoices, purchase-side approval routing through the workflow
engine), expenses, banking feeds and reconciliation, VAT/Making Tax Digital, multi-currency, the
fuller reporting suite (P&L, balance sheet), import/export, and the customer portal /
online-payment surface (blocked on a payment-provider decision, not a code gap). All correctly
Charter Phase 3/4 scope, or explicitly deferred within Phase 2 — see the Finance spec's own
suggested MVP cut (§9.1).

UI-wise: customers, suppliers, products, invoices and notifications have screens. Quotations,
credit notes, payments and the aged receivables report are fully built and tested at the API
layer but have no screen yet — the next UI increment, not a backend gap.

**What the demo does:** log in → create a customer → raise an invoice with exact-penny maths
(BigInt throughout — never a floating-point cent) → **issue** it (allocates a gap-free number,
posts a **balanced double-entry** to the ledger, checks the credit limit, writes an audit
record, notifies the issuer in-app, and locks the invoice) → view a trial balance that proves
the books balance. Company data is kept apart at the database level by PostgreSQL **row-level
security**, with automated cross-tenant tests that fail the build if a leak ever slips through.

Stack, exactly per the docs: **NestJS + Next.js + PostgreSQL + Prisma + Docker**, plus
**MinIO** (S3-compatible object storage) for the documents service.

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
- MinIO console → http://localhost:9001  (login: **tessma** / **tessma12345**)

On start the API container automatically: applies the migration history (`prisma migrate
deploy`), seeds the plan catalogue + demo tenant, then applies the row-level-security policies
(`prisma/rls.sql`, which also creates the restricted `tessma_app` role the app connects as).
Order matters — seeding runs as the owner before RLS is switched on, and the plan catalogue
must exist before `/auth/register` can subscribe a tenant to it. The whole sequence is
idempotent — safe to restart the container without a fresh volume.

### Run without Docker (three terminals)

```bash
# terminal 1 — database + object storage
docker compose up db minio

# terminal 2 — API  (first time: migrate, seed, apply RLS)
npm install               # installs the whole workspace (api + web share one lockfile)
cd apps/api
npm run db:setup          # = prisma migrate deploy + seed + apply rls.sql
npm run start:dev

# terminal 3 — web
cd apps/web && npm run dev
```

---

## The demo script (what to show)

1. **Log in** at /login → the API sets an httpOnly session cookie (never readable by page
   script) plus a separate, readable CSRF cookie the app echoes back on every mutation.
2. **Customers** → add "Acme Retail Ltd". Created as a role on the shared **Party**, not a
   private customers table. Adding it again warns of a possible duplicate before creating it.
3. **Suppliers / Products** → add one of each. A supplier's bank details, if added via the API,
   are encrypted at rest — the database row never contains the plaintext account number.
4. **Invoices** → *Create draft*: two lines, discount + VAT, computed to the exact penny —
   there is no `Number(x) * pct/100` anywhere in the money path.
5. *Issue*: watch the status flip to **ISSUED** with number **INV-00001**, a due date appear
   (from the customer's payment terms), the **trial balance** appear — Debtors (debit) exactly
   equals Sales + Output VAT (credit) — and a new entry land on **Notifications**.
6. **Prove isolation and correctness** (the money shot for a reviewer):
   ```bash
   cd apps/api
   npm test                            # exact-decimal money, including the specific
                                        # percentages (29%, 35%, 70%...) that break under float
   npm run test:rbac                   # RBAC: OWNER allowed, SALES_USER denied
   npm run test:e2e                    # cross-tenant isolation (Prisma layer, real HTTP with
                                        # cookies + CSRF, append-only grants), documents against
                                        # real object storage, workflow, notifications, AI Gateway
   npm run test:stage2                 # full invoice lifecycle, quotations, credit notes
                                        # (including the bad-debt posting), payment allocation,
                                        # aged receivables, encrypted supplier bank details
   ```
   All of it runs in CI (`.github/workflows/ci.yml`) on every push — 45 tests across 16 suites.

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
| Balanced double-entry posting + immutability | `apps/api/src/modules/finance/finance.service.ts` (`issue`, `cancel`) |
| Encrypted supplier bank details (SEC-DAT-03) | `apps/api/src/shared/crypto/field-encryption.ts`, `core/party/suppliers.service.ts` |
| Reversing postings — credit notes, incl. the bad-debt account switch | `apps/api/src/modules/finance/credit-notes/credit-notes.service.ts` |
| Payment recording + allocation, invoice status transitions | `apps/api/src/modules/finance/payments/payments.service.ts` |
| Aged receivables (bucketed, outstanding not original balance) | `apps/api/src/modules/finance/reports/reports.service.ts` |
| Duplicate-party detection as a real two-step contract | `apps/api/src/core/party/duplicate-detection.ts` |
| Append-only audit, with actor typing for future partner access | `apps/api/src/core/audit/audit.service.ts` |
| Cross-tenant build-blockers (three angles) | `apps/api/test/cross-tenant.e2e-spec.ts`, `test/http-cross-tenant.e2e-spec.ts`, `test/append-only.e2e-spec.ts` |
| Permissions registry + system roles | `apps/api/src/core/permissions/permissions.registry.ts` |
| Subscriptions & entitlements (server-side gate) | `apps/api/src/core/subscriptions/entitlements.service.ts`, `entitlements.guard.ts` |
| Branding resolution chain (Charter §7.4) | `apps/api/src/core/branding/branding.service.ts`, consumed in `apps/web/app/layout.tsx` |
| Partner + branding + audit-actor-typing data model (Charter §7.9 "cannot wait") | `apps/api/prisma/schema.prisma` |
| Object storage abstraction, signed URLs, API never touches file bytes | `apps/api/src/core/documents/` |
| Notification channel abstraction (in-app wired, email dev-mode, SMS/push stubbed) | `apps/api/src/core/notifications/` |
| Generic approval / workflow state machine | `apps/api/src/core/workflow/workflow.service.ts` |
| AI Gateway: routing, redaction, metering, audit, per-tenant kill switch | `apps/api/src/core/ai/ai-gateway.service.ts` |
| One error contract, no leaked internals (incl. Prisma unique/not-found → 409/404) | `apps/api/src/shared/errors/http-exception.filter.ts` |
| Server-side validation on every mutating route | `apps/api/src/shared/validation/` |
| Design system: shared components, brand colour via CSS custom property | `apps/web/components/ui.tsx`, `apps/web/app/layout.tsx` |
| Data model (tenantId on every table) | `apps/api/prisma/schema.prisma` |

---

## What's next

- **Finish Stage 2's UI**: quotations, credit notes, payments and the aged receivables report
  are fully built and tested server-side — the next increment is screens for them, reusing
  `components/ui.tsx`.
- **Accounts payable & expenses** (Finance spec EP-FIN-09/10): a `PurchaseInvoice` model
  mirroring `Invoice`, and expense claims that submit into the workflow engine already built in
  Stage 1 (`POST /approvals/submit`) rather than hand-rolling approval logic.
- **Banking & VAT** (Charter Phase 4): bank feeds, reconciliation, the VAT engine, HMRC Making
  Tax Digital. Start the HMRC developer registration and Open Banking provider evaluation now —
  the lead time is the actual blocker, not the code.
- **A real AI provider**, once one is chosen and contracted (data-processing terms that
  prohibit training on submitted content — AI safety rule 8) — a new class implementing
  `AiProvider`, swapped in for `NullProvider` in `ai-gateway.service.ts`. Nothing else changes.

**Never cut:** tenancy/RLS, balanced ledger posting, exact-decimal money, immutability, CSRF on
mutations, server-side validation, cross-tenant tests on every new table.

---

## Important notes / honest caveats

- This is a **foundation slice plus a partial Finance MVP**, not the platform. The partner-facing
  self-service console and custom domains are deliberately not built — Charter §7.9 places both
  in Phase 3; what Phase 1 requires underneath them (Partner entity, `partnerId`, branding
  resolution, audit actor typing) is built and tested.
- The AI Gateway ships with `NullProvider` — a deterministic, no-network stand-in, not a claim
  of AI capability. It exists so the plumbing around a provider (redaction, metering, audit, the
  tenant kill switch) is provably correct before a real model is ever wired in.
- Malware scanning on uploaded documents is named in the Charter as mandatory before storage and
  is **not** wired into this slice — the MIME allowlist and size cap are enforced, but claiming
  a scan without a scanner would be worse than admitting the gap.
- SMS and push notification channels are declared (the interface, the `channel` enum) but have
  no provider: sending on either records a `FAILED` row rather than pretending to succeed.
  Wiring a real one (Twilio, FCM/APNs) is a product decision, not a code gap.
- The RLS pattern here (transaction-local `set_config`) is the **spike the Charter demands**,
  solved. Read `prisma.service.ts` — it's the single most important file to understand.
- `User` carries two RLS policies rather than one, and is documented inline in `rls.sql`: reads
  needed for pre-authentication email lookup are permissive, writes are hard-scoped to the
  caller's own tenant. Email is also globally unique at the schema level, so that read can never
  resolve ambiguously across tenants.
- Money is integer pence throughout, computed with exact BigInt arithmetic (no
  `Number(x) * pct / 100` anywhere — that silently mis-rounds specific percentages, e.g. 29% of
  £5.00), serialised to strings over JSON so nothing is lost.
- `FIELD_ENCRYPTION_KEY` (supplier bank details) has the same dev-only-default pattern as
  `JWT_SECRET` — a working 32-byte key out of the box, meant to be replaced for any environment
  holding real data. It is deliberately a *different* secret from `JWT_SECRET`: a leaked session
  secret shouldn't also unlock encrypted bank details.
- Sessions are httpOnly cookies with a double-submit CSRF token, not a bearer token in
  `localStorage` — page script never touches the access token. A bearer `Authorization` header
  still works for machine/API clients and is exempt from the CSRF check (it isn't automatically
  replayable by a third-party page the way a cookie is).
- Presigned document URLs are signed twice over: the API's own bucket-bootstrap and
  upload-confirmation calls use the compose-network hostname (`minio:9000`); the URLs handed to
  the *browser* are signed against the host-published one (`localhost:9000`), because a signed
  URL bakes its host into the signature — see `S3Service`'s class comment.
- `apps/web`'s Next.js is pinned to the latest 14.2.x patch (not the 16.x line) to avoid an
  unvalidated major-version jump in this pass. `npm audit` still reports two Next.js/PostCSS
  advisories whose fix requires Next 16, which changes core App Router APIs (e.g. `cookies()`
  becomes async) — upgrading is a deliberate follow-up, not a `--force` in CI. Similarly, a
  `picomatch` advisory reachable only through `@nestjs/cli`'s dev-tooling dependency tree (not
  runtime code) is left alone rather than force-bumped without validation.
- Before production: move secrets to a real secret store, add refresh-token rotation (today's
  session is a single 12h access token, not a rotating pair), rate limiting on
  auth/export/report/AI endpoints, malware scanning on uploads, and the Next 16 upgrade above.
