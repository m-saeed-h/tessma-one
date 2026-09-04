/**
 * Payments (FR-ARC-003 to 006): recording posts Dr Bank / Cr Debtors
 * immediately; allocation moves an invoice through
 * PARTIALLY_PAID -> PAID and caps at both the payment's unallocated balance
 * and the invoice's outstanding balance; one payment can be split across
 * multiple invoices (FR-ARC-004).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Payments', () => {
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
      .send({ legalName: `Cust ${Date.now()}` })
      .expect(201);
    return res.body.id;
  }

  async function issuedInvoice(owner: { at: string; csrf: string }, partyId: string, unitPrice: number) {
    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice, vatRatePct: 20 }] })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    return issued.body;
  }

  it('recording a payment posts Dr Bank / Cr Debtors immediately, independent of allocation', async () => {
    const owner = await registerTenant('Payment Ledger Ltd', `payment-ledger-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, method: 'BANK_TRANSFER', amountPence: 5000 })
      .expect(201);

    const tb = await request(app.getHttpServer())
      .get('/invoices/trial-balance').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(BigInt(tb.body['1200'].debit)).toBe(5000n); // Bank
    expect(BigInt(tb.body['1100'].credit)).toBe(5000n); // Debtors
  });

  it('partial allocation moves an invoice to PARTIALLY_PAID, full allocation to PAID', async () => {
    const owner = await registerTenant('Payment Allocate Ltd', `payment-alloc-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const invoice = await issuedInvoice(owner, partyId, 10000); // gross 12000

    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, method: 'CARD', amountPence: 12000 })
      .expect(201);

    const partial = await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 5000 })
      .expect(201);
    expect(partial.body.unallocated).toBe('7000');

    const invAfterPartial = await request(app.getHttpServer())
      .get(`/invoices/${invoice.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(invAfterPartial.body.status).toBe('PARTIALLY_PAID');

    await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 7000 })
      .expect(201);

    const invAfterFull = await request(app.getHttpServer())
      .get(`/invoices/${invoice.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(invAfterFull.body.status).toBe('PAID');
  });

  it('allocation cannot exceed the payment\'s unallocated balance or the invoice\'s outstanding balance', async () => {
    const owner = await registerTenant('Payment Cap Ltd', `payment-cap-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const invoice = await issuedInvoice(owner, partyId, 10000); // gross 12000

    const smallPayment = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, method: 'CASH', amountPence: 1000 })
      .expect(201);

    const overPayment = await request(app.getHttpServer())
      .post(`/payments/${smallPayment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 2000 }); // more than the 1000 payment holds
    expect(overPayment.status).toBe(400);
    expect(overPayment.body.error.code).toBe('payment.exceeds_unallocated');

    const bigPayment = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, method: 'CASH', amountPence: 50000 })
      .expect(201);
    const overInvoice = await request(app.getHttpServer())
      .post(`/payments/${bigPayment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 50000 }); // more than the 12000 owed
    expect(overInvoice.status).toBe(400);
    expect(overInvoice.body.error.code).toBe('payment.exceeds_invoice_outstanding');
  });

  it('one payment splits across multiple invoices at creation time', async () => {
    const owner = await registerTenant('Payment Split Ltd', `payment-split-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const invA = await issuedInvoice(owner, partyId, 5000); // gross 6000
    const invB = await issuedInvoice(owner, partyId, 5000); // gross 6000

    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({
        partyId, method: 'BANK_TRANSFER', amountPence: 12000,
        allocations: [{ invoiceId: invA.id, amountPence: 6000 }, { invoiceId: invB.id, amountPence: 6000 }],
      })
      .expect(201);
    expect(payment.body.unallocated).toBe('0');

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).get(`/invoices/${invA.id}`).set('Cookie', [`tsm_at=${owner.at}`]),
      request(app.getHttpServer()).get(`/invoices/${invB.id}`).set('Cookie', [`tsm_at=${owner.at}`]),
    ]);
    expect(a.body.status).toBe('PAID');
    expect(b.body.status).toBe('PAID');
  });
});
