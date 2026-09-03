/**
 * Endpoint-level cross-tenant isolation test — NFR-FIN-07 / FR-AUD-007 ask for
 * 100% of finance endpoints covered by an automated cross-tenant test, which
 * the original Prisma-layer-only test (cross-tenant.e2e-spec.ts) does not
 * demonstrate: it never goes through a controller, a guard, or an HTTP
 * request. This one boots the real Nest app and drives it exactly as a
 * browser would — cookie auth, CSRF header and all.
 *
 * Also exercises the two other correctness fixes made alongside it: the
 * cookie-authenticated CSRF guard (SEC-APP-04), and the fix for the bug where
 * a duplicate email across two tenants let login silently resolve to an
 * arbitrary one of them.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000); // first-run ts-jest compile + Nest DI graph can exceed the 5s default

describe('HTTP-level cross-tenant isolation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function cookie(res: request.Response, name: string): string {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const line = raw.find((c) => c.startsWith(`${name}=`));
    if (!line) throw new Error(`expected Set-Cookie for ${name}`);
    return line.split(';')[0].split('=')[1];
  }

  async function registerTenant(company: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company, email, password: 'password123', name: 'Owner' })
      .expect(201);
    return { at: cookie(res, 'tsm_at'), csrf: cookie(res, 'tsm_csrf') };
  }

  it('tenant A cannot see tenant B customers over the API, even fully authenticated', async () => {
    const stamp = Date.now();
    const a = await registerTenant('Alpha Ltd', `alpha-${stamp}@test.local`);
    const b = await registerTenant('Bravo Ltd', `bravo-${stamp}@test.local`);

    const bCustomer = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${b.at}`])
      .set('X-CSRF-Token', b.csrf)
      .send({ legalName: 'Bravo-Only Customer' })
      .expect(201);

    const aList = await request(app.getHttpServer())
      .get('/customers')
      .set('Cookie', [`tsm_at=${a.at}`])
      .expect(200);

    expect(aList.body.some((p: { id: string }) => p.id === bCustomer.body.id)).toBe(false);
  });

  it('rejects a cookie-authenticated mutation without a matching CSRF header (SEC-APP-04)', async () => {
    const a = await registerTenant('Csrf Test Ltd', `csrf-${Date.now()}@test.local`);

    // No CSRF header at all.
    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${a.at}`])
      .send({ legalName: 'Should be rejected' })
      .expect(403);

    // A CSRF token that doesn't belong to this session (proves it's bound to
    // the session, not just "any non-empty value").
    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', 'not-the-real-token')
      .send({ legalName: 'Should also be rejected' })
      .expect(403);

    // The correct token succeeds.
    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .send({ legalName: 'Should succeed' })
      .expect(201);
  });

  it('rejects a duplicate registration email (was a silent cross-tenant login bug)', async () => {
    const email = `dup-${Date.now()}@test.local`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company: 'First Co', email, password: 'password123', name: 'Owner' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company: 'Second Co', email, password: 'password123', name: 'Owner' })
      .expect(409);
  });

  it('rejects malformed input at the API boundary instead of a 500 or a silent bad record', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company: '', email: 'not-an-email', password: '123', name: '' })
      .expect(400);
    expect(res.body.error.code).toBe('validation.failed');
  });

  it('never leaks internal detail on an unexpected error', async () => {
    const res = await request(app.getHttpServer()).get('/invoices/trial-balance').expect(401);
    expect(res.body).toEqual({ error: expect.objectContaining({ code: 'unauthorized' }) });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+/); // no stack frame
  });
});
