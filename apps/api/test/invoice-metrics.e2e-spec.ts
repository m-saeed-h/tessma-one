/**
 * Backs the UI's dashboard metric strip and the invoice detail panel's
 * ledger-posting block — both need to be real numbers derived from actual
 * postings/payments, not placeholders, so this proves the arithmetic rather
 * than just that the endpoints respond.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Invoice metrics and per-invoice ledger postings', () => {
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

  it('GET /invoices/:id includes the balanced ledger postings for that invoice specifically', async () => {
    const owner = await registerTenant('Metrics Ledger Ltd', `metrics-ledger-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice: 10000, vatRatePct: 20 }] })
      .expect(201);

    // A draft has no postings yet.
    const draftGet = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(draftGet.body.ledgerEntries).toEqual([]);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const issuedGet = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    const entries = issuedGet.body.ledgerEntries;
    expect(entries.length).toBe(3);
    expect(entries.every((e: any) => e.account.code && e.account.name)).toBe(true);

    const totalDebit = entries.reduce((s: bigint, e: any) => s + BigInt(e.debit), 0n);
    const totalCredit = entries.reduce((s: bigint, e: any) => s + BigInt(e.credit), 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(12000n); // gross of this invoice specifically
  });

  it('invoice-metrics reflects real outstanding/overdue/paid-this-month/avg-days-to-pay', async () => {
    const owner = await registerTenant('Metrics Agg Ltd', `metrics-agg-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    // One overdue invoice (due immediately, never paid).
    const overdueDraft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Overdue work', quantity: 1, unitPrice: 10000, vatRatePct: 20 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoices/${overdueDraft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ dueInDays: 0 })
      .expect(201);

    // One paid-in-full invoice, paid the same day (0 days to pay is fine —
    // just proves the field is a real computed number, not null).
    const paidDraft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Paid work', quantity: 1, unitPrice: 5000, vatRatePct: 20 }] })
      .expect(201);
    const paidIssued = await request(app.getHttpServer())
      .post(`/invoices/${paidDraft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    const payment = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, method: 'CARD', amountPence: 6000 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/payments/${payment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: paidIssued.body.id, amountPence: 6000 })
      .expect(201);

    const metrics = await request(app.getHttpServer())
      .get('/reports/invoice-metrics').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);

    expect(BigInt(metrics.body.outstandingPence)).toBe(12000n); // only the overdue one remains open
    expect(BigInt(metrics.body.overduePence)).toBe(12000n);
    expect(BigInt(metrics.body.paidThisMonthPence)).toBe(6000n);
    expect(typeof metrics.body.avgDaysToPay).toBe('number');
  });
});
