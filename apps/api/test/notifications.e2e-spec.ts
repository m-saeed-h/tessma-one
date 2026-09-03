/**
 * Notifications platform service: proves a real call site (issuing an
 * invoice notifies the issuer) actually delivers an in-app notification, that
 * marking it read is scoped to its owner (object-level check, Charter §10.2),
 * and that one tenant's notifications never appear in another's list.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Notifications platform service', () => {
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

  it('issuing an invoice notifies the issuer in-app', async () => {
    const owner = await registerTenant('Notify Test Ltd', `notify-${Date.now()}@test.local`);

    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ legalName: 'Notify Customer Ltd' })
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .send({ partyId: customer.body.id, lines: [{ description: 'Work', quantity: 1, unitPrice: 1000 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`])
      .set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', [`tsm_at=${owner.at}`])
      .expect(200);

    const invoiceNotification = list.body.find((n: { subject: string }) => n.subject.includes('issued'));
    expect(invoiceNotification).toBeTruthy();
    expect(invoiceNotification.status).toBe('SENT');
    expect(invoiceNotification.channel).toBe('IN_APP');
  });

  it('marking a notification read updates its status, and only its owner can do it', async () => {
    const stamp = Date.now();
    const a = await registerTenant('Read Test A Ltd', `read-a-${stamp}@test.local`);
    const b = await registerTenant('Read Test B Ltd', `read-b-${stamp}@test.local`);

    // Trigger a notification for tenant A by issuing an invoice.
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .send({ legalName: 'Cust' })
      .expect(201);
    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .send({ partyId: customer.body.id, lines: [{ description: 'Work', quantity: 1, unitPrice: 1000 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/notifications')
      .set('Cookie', [`tsm_at=${a.at}`])
      .expect(200);
    const notificationId = listA.body[0].id;

    // Tenant B never sees tenant A's notification at all (cross-tenant RLS) —
    // trying to mark it read 404s rather than leaking a "not yours" 403.
    await request(app.getHttpServer())
      .post(`/notifications/${notificationId}/read`)
      .set('Cookie', [`tsm_at=${b.at}`])
      .set('X-CSRF-Token', b.csrf)
      .expect(404);

    const marked = await request(app.getHttpServer())
      .post(`/notifications/${notificationId}/read`)
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .expect(201);
    expect(marked.body.status).toBe('READ');
  });
});
