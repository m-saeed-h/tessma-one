/**
 * AI Gateway: proves the safety rules that actually matter for a Stage 1
 * "interface exists, plumbing is correct" service — every call is audited
 * (rule 11), a tenant admin's kill switch actually blocks calls (rule 12),
 * output always carries a Suggested state (rule 5) and a confidence value
 * (rule 7), and PII-shaped content never reaches the usage log unredacted.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';
import { PrismaService } from '../src/shared/prisma/prisma.service';

jest.setTimeout(30000);

describe('AI Gateway', () => {
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

  // Decoded directly from the issued JWT, not looked up by tenant name
  // afterwards — Tenant.name has no uniqueness constraint, so a name-based
  // lookup can silently resolve to a STALE tenant left over from an earlier
  // test run (this exact mistake broke workflow.e2e-spec.ts once already).
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

  it('returns a Suggested-state response with a confidence value, and logs the call', async () => {
    const owner = await registerTenant('AI Test Ltd', `ai-${Date.now()}@test.local`);

    const res = await request(app.getHttpServer())
      .post('/ai/complete')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ task: 'test_task', prompt: 'Summarise this invoice.' })
      .expect(201);

    expect(res.body.state).toBe('Suggested');
    expect(typeof res.body.confidence).toBe('number');

    const events = await prisma.forTenant(owner.tenantId, (tx) => tx.aiUsageEvent.findMany({ where: { tenantId: owner.tenantId } }));
    expect(events.length).toBe(1);
    expect(events[0].task).toBe('test_task');
    expect(events[0].promptVersion).toBeTruthy();
  });

  it('redacts email-shaped content before it is ever logged', async () => {
    const owner = await registerTenant('AI Redaction Ltd', `ai-redact-${Date.now()}@test.local`);
    await request(app.getHttpServer())
      .post('/ai/complete')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ task: 'test_task', prompt: 'Contact the customer at jane.doe@example.com about this.' })
      .expect(201);

    const events = await prisma.forTenant(owner.tenantId, (tx) => tx.aiUsageEvent.findMany({ where: { tenantId: owner.tenantId } }));
    expect(events[0].redacted).toBe(true);
  });

  it('a tenant admin can disable AI entirely, and the Gateway then refuses every call', async () => {
    const owner = await registerTenant('AI Disabled Ltd', `ai-disabled-${Date.now()}@test.local`);

    await prisma.forTenant(owner.tenantId, (tx) =>
      tx.tenantSubscription.update({ where: { tenantId: owner.tenantId }, data: { aiEnabled: false } }),
    );

    const res = await request(app.getHttpServer())
      .post('/ai/complete')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ task: 'test_task', prompt: 'This should not run.' })
      .expect(403);
    expect(res.body.error.code).toBe('ai.disabled');
  });
});
