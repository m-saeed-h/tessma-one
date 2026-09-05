/**
 * FR-SIN-009 (branded VAT-invoice PDF), FR-SIN-010/011/012 (emailing an
 * invoice to a customer, with delivery status recorded), FR-SIN-013
 * (duplicate an invoice as a new draft), and FR-SET-007/009/010 (the
 * tenant's own legal/VAT profile, and its default payment terms feeding
 * invoice issue).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Invoice PDF, customer email delivery, duplication, and finance settings', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

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

  async function createCustomer(owner: { at: string; csrf: string }) {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: `Cust ${Date.now()}`, email: 'ap@customer.test' })
      .expect(201);
    return res.body.id;
  }

  it('renders a PDF for both a draft and an issued invoice', async () => {
    const owner = await registerTenant('PDF Ltd', `pdf-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Consulting', quantity: 2, unitPrice: 5000, vatRatePct: 20 }] })
      .expect(201);

    const draftPdf = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}/pdf`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(draftPdf.headers['content-type']).toBe('application/pdf');
    expect(draftPdf.body.slice(0, 5).toString()).toBe('%PDF-');
    expect(draftPdf.body.length).toBeGreaterThan(500);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const issuedPdf = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}/pdf`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(issuedPdf.body.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('refuses to email a draft, sends an issued invoice, and records the delivery', async () => {
    const owner = await registerTenant('Send Ltd', `send-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice: 10000, vatRatePct: 20 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/send`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ to: ['ap@customer.test'], subject: 'Invoice', body: 'Please find attached.' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const sent = await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/send`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ to: ['ap@customer.test'], cc: ['manager@customer.test'], subject: 'Invoice', body: 'Please find attached.' })
      .expect(201);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.to).toEqual(['ap@customer.test']);

    const withDeliveries = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(withDeliveries.body.deliveries.length).toBe(1);
    expect(withDeliveries.body.deliveries[0].status).toBe('SENT');
  });

  it('duplicates an issued invoice as a new, independent draft', async () => {
    const owner = await registerTenant('Dup Ltd', `dup-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const original = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Repeat job', quantity: 3, unitPrice: 2500, discountPct: 5, vatRatePct: 20 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoices/${original.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const copy = await request(app.getHttpServer())
      .post(`/invoices/${original.body.id}/duplicate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    expect(copy.body.id).not.toBe(original.body.id);
    expect(copy.body.status).toBe('DRAFT');
    expect(copy.body.number).toBeNull();
    expect(copy.body.grossTotal).toBe(original.body.grossTotal);
    expect(copy.body.lines).toHaveLength(1);
    expect(copy.body.lines[0].description).toBe('Repeat job');
    expect(copy.body.lines[0].discountPct).toBe(5);
  });

  it('finance settings round-trip, and default payment terms feed invoice issue when nothing else overrides it', async () => {
    const owner = await registerTenant('Settings Ltd', `settings-${Date.now()}@test.local`);

    const empty = await request(app.getHttpServer())
      .get('/finance/settings').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(empty.body.legalName).toBeNull();
    expect(empty.body.defaultPaymentTermsDays).toBe(30);

    const saved = await request(app.getHttpServer())
      .put('/finance/settings')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: 'Settings Ltd', vatNumber: 'GB999999973', defaultPaymentTermsDays: 45 })
      .expect(200);
    expect(saved.body.vatNumber).toBe('GB999999973');
    expect(saved.body.defaultPaymentTermsDays).toBe(45);

    const partyId = await createCustomer(owner); // no per-customer paymentTerms override sent
    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice: 1000, vatRatePct: 20 }] })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const issueDate = new Date(issued.body.issueDate).getTime();
    const dueDate = new Date(issued.body.dueDate).getTime();
    const days = Math.round((dueDate - issueDate) / 86_400_000);
    expect(days).toBe(45);
  });
});
