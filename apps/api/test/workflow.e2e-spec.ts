/**
 * Workflow / approval engine: proves the properties FR-APR requires —
 * sequential multi-step approval, a submitter can't approve their own item
 * (FR-APR-004), an approver must actually hold the step's required role, a
 * subject with no configured rule auto-approves, and a rejection ends the
 * chain rather than advancing it. All exercised against a generic
 * subjectType — nothing here is Finance-specific (FR-APR-009).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';
import { PrismaService } from '../src/shared/prisma/prisma.service';

jest.setTimeout(30000);

describe('Workflow / approval engine', () => {
  let app: INestApplication;
  const prisma = new PrismaService();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function cookie(res: request.Response, name: string): string {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const line = raw.find((c) => c.startsWith(`${name}=`));
    if (!line) throw new Error(`expected Set-Cookie for ${name}`);
    return line.split(';')[0].split('=')[1];
  }

  // Decoded directly from the issued JWT rather than looked up by tenant
  // name afterwards — Tenant.name has no uniqueness constraint, and this
  // suite's tenant names repeat across runs, so a name-based lookup can
  // silently resolve to a STALE tenant from an earlier run and attach test
  // users to the wrong tenant (a real bug this exact mistake produced once).
  function decodeTenantId(jwt: string): string {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString()).tenantId;
  }

  async function registerTenant(company: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company, email, password: 'password123', name: 'Owner' })
      .expect(201);
    const at = cookie(res, 'tsm_at');
    return { at, csrf: cookie(res, 'tsm_csrf'), tenantId: decodeTenantId(at) };
  }

  // Registration always creates a brand-new tenant; there's no "invite a
  // colleague" endpoint yet (Stage 2+). To get a second real, logged-in user
  // in the SAME tenant for this test, create the row directly (owner DB
  // role, matching how prisma/seed.ts does it) with a real argon2 hash, then
  // log in through the actual HTTP endpoint like any other user would.
  async function addUserWithRole(tenantId: string, roleName: string, email: string) {
    const passwordHash = await argon2.hash('password123');
    await prisma.forTenant(tenantId, async (tx) => {
      const role = await tx.role.findFirstOrThrow({ where: { tenantId, name: roleName } });
      const user = await tx.user.create({ data: { tenantId, email, passwordHash, displayName: roleName } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
    });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(201);
    return { at: cookie(res, 'tsm_at'), csrf: cookie(res, 'tsm_csrf') };
  }

  it('a subject with no configured rule auto-approves', async () => {
    const owner = await registerTenant('No Rule Ltd', `no-rule-${Date.now()}@test.local`);
    const res = await request(app.getHttpServer())
      .post('/approvals/submit')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ subjectType: 'test.thing', subjectId: 'thing-1' })
      .expect(201);
    expect(res.body.status).toBe('APPROVED');
  });

  it('enforces role, blocks self-approval, sequences two steps, and rejection ends the chain', async () => {
    const stamp = Date.now();
    const owner = await registerTenant('Workflow Test Ltd', `workflow-${stamp}@test.local`);

    const approver = await addUserWithRole(owner.tenantId, 'FINANCE_MANAGER', `approver-${stamp}@test.local`);
    const submitter = await addUserWithRole(owner.tenantId, 'SALES_USER', `submitter-${stamp}@test.local`);

    // Two-step rule: FINANCE_MANAGER, then OWNER.
    await request(app.getHttpServer())
      .post('/approvals/rules')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({
        subjectType: 'test.expense',
        steps: [
          { sequence: 1, approverRole: 'FINANCE_MANAGER' },
          { sequence: 2, approverRole: 'OWNER' },
        ],
      })
      .expect(201);

    // Submitter (SALES_USER — no approvals.act permission at all) submits.
    const submitted = await request(app.getHttpServer())
      .post('/approvals/submit')
      .set('Cookie', [`tsm_at=${submitter.at}`])
      .set('X-CSRF-Token', submitter.csrf)
      .send({ subjectType: 'test.expense', subjectId: `exp-${stamp}`, amountPence: 5000 })
      .expect(201);
    expect(submitted.body.status).toBe('PENDING');

    // Wrong role: OWNER's role is literally named "OWNER", not
    // "FINANCE_MANAGER" — step 1 requires the latter, so even OWNER (who
    // holds the approvals.act PERMISSION via the OWNER role granting every
    // permission) is blocked by the ROLE check, proving it's a real
    // name-based check, not "any admin passes".
    const wrongRole = await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(wrongRole.body.error.code).toBe('approval.wrong_role');

    // Correct role (FINANCE_MANAGER), correct step, approves -> advances to step 2.
    const step1 = await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${approver.at}`])
      .set('X-CSRF-Token', approver.csrf)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(step1.body.status).toBe('PENDING');

    // Step 1 is done — the same approver acting again on the (now step-2)
    // request is the wrong role again.
    await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${approver.at}`])
      .set('X-CSRF-Token', approver.csrf)
      .send({ decision: 'APPROVED' })
      .expect(403);

    // OWNER approves step 2 -> fully approved.
    const step2 = await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'APPROVED' })
      .expect(201);
    expect(step2.body.status).toBe('APPROVED');

    // Already decided — cannot be decided again.
    await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'APPROVED' })
      .expect(400);
  });

  it('blocks self-approval even when the submitter holds the exact required role', async () => {
    const stamp = Date.now();
    const owner = await registerTenant('Self Approval Ltd', `self-approve-${stamp}@test.local`);
    const approver = await addUserWithRole(owner.tenantId, 'FINANCE_MANAGER', `sa-approver-${stamp}@test.local`);

    await request(app.getHttpServer())
      .post('/approvals/rules')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ subjectType: 'test.expense', steps: [{ sequence: 1, approverRole: 'FINANCE_MANAGER' }] })
      .expect(201);

    const submitted = await request(app.getHttpServer())
      .post('/approvals/submit')
      .set('Cookie', [`tsm_at=${approver.at}`])
      .set('X-CSRF-Token', approver.csrf)
      .send({ subjectType: 'test.expense', subjectId: `exp-self-${stamp}` })
      .expect(201);
    expect(submitted.body.status).toBe('PENDING');

    // Same user who submitted, holding the exact right role — still blocked.
    const res = await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${approver.at}`])
      .set('X-CSRF-Token', approver.csrf)
      .send({ decision: 'APPROVED' })
      .expect(403);
    expect(res.body.error.code).toBe('approval.self_approval');
  });

  it('a rejection ends the chain rather than advancing it', async () => {
    const stamp = Date.now();
    const owner = await registerTenant('Rejection Ltd', `rejection-${stamp}@test.local`);
    const approver = await addUserWithRole(owner.tenantId, 'FINANCE_MANAGER', `rej-approver-${stamp}@test.local`);
    const submitter = await addUserWithRole(owner.tenantId, 'SALES_USER', `rej-submitter-${stamp}@test.local`);

    await request(app.getHttpServer())
      .post('/approvals/rules')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({
        subjectType: 'test.expense',
        steps: [{ sequence: 1, approverRole: 'FINANCE_MANAGER' }, { sequence: 2, approverRole: 'OWNER' }],
      })
      .expect(201);

    const submitted = await request(app.getHttpServer())
      .post('/approvals/submit')
      .set('Cookie', [`tsm_at=${submitter.at}`])
      .set('X-CSRF-Token', submitter.csrf)
      .send({ subjectType: 'test.expense', subjectId: `exp-rej-${stamp}` })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${approver.at}`])
      .set('X-CSRF-Token', approver.csrf)
      .send({ decision: 'REJECTED', comment: 'Not this time' })
      .expect(201);
    expect(rejected.body.status).toBe('REJECTED');

    // Rejected — OWNER (step 2) has nothing to decide; acting on it now fails as already-decided.
    await request(app.getHttpServer())
      .post(`/approvals/${submitted.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'APPROVED' })
      .expect(400);
  });

  it('myQueue only shows items awaiting THIS user\'s decision', async () => {
    const stamp = Date.now();
    const owner = await registerTenant('Queue Test Ltd', `queue-${stamp}@test.local`);
    const approver = await addUserWithRole(owner.tenantId, 'FINANCE_MANAGER', `queue-approver-${stamp}@test.local`);
    const submitter = await addUserWithRole(owner.tenantId, 'SALES_USER', `queue-submitter-${stamp}@test.local`);

    await request(app.getHttpServer())
      .post('/approvals/rules')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ subjectType: 'test.expense', steps: [{ sequence: 1, approverRole: 'FINANCE_MANAGER' }] })
      .expect(201);

    const submitted = await request(app.getHttpServer())
      .post('/approvals/submit')
      .set('Cookie', [`tsm_at=${submitter.at}`])
      .set('X-CSRF-Token', submitter.csrf)
      .send({ subjectType: 'test.expense', subjectId: `exp-queue-${stamp}` })
      .expect(201);

    const approverQueue = await request(app.getHttpServer())
      .get('/approvals')
      .set('Cookie', [`tsm_at=${approver.at}`])
      .expect(200);
    expect(approverQueue.body.some((r: { id: string }) => r.id === submitted.body.id)).toBe(true);

    // Owner holds a different role name (OWNER, not FINANCE_MANAGER) — not in their queue.
    const ownerQueue = await request(app.getHttpServer())
      .get('/approvals')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .expect(200);
    expect(ownerQueue.body.some((r: { id: string }) => r.id === submitted.body.id)).toBe(false);
  });
});
