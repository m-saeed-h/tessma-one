/**
 * FR-SET-001/002/004/011/012 (financial year, base currency lock, numbering
 * schemes, period locking — the one thing the Finance spec says "must not
 * be deferred under any circumstance"), FR-LED-004 to 007 (manual journals),
 * EP-FIN-10 (expenses), EP-FIN-09 (accounts payable), FR-RPT-002/003 (P&L,
 * balance sheet), and NFR-FIN-09 (idempotent payment recording).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Periods, numbering, journals, expenses and accounts payable', () => {
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

  async function createSupplier(owner: { at: string; csrf: string }) {
    const res = await request(app.getHttpServer())
      .post('/suppliers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: `Supp ${Date.now()}` })
      .expect(201);
    return res.body.id;
  }

  async function accountId(owner: { at: string }, code: string): Promise<string> {
    const tb = await request(app.getHttpServer())
      .get('/invoices/trial-balance').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    // trial balance keys by code but doesn't carry ids; fetch via a manual
    // journal attempt isn't enough either — read accounts through a
    // purchase-invoice creation error message is fragile, so instead we
    // resolve ids the same way the app does: there is no direct GET
    // /accounts endpoint, so tests that need an account id create a
    // purchase invoice with nominalCode and let the server resolve it.
    void tb;
    return code;
  }

  it('a closed accounting period rejects a new posting, and reopening restores it', async () => {
    const owner = await registerTenant('Period Ltd', `period-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const now = new Date();
    await request(app.getHttpServer())
      .post('/finance/periods/generate')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ startYear: now.getFullYear(), startMonth: 1, startDay: 1 })
      .expect(201);

    const periods = await request(app.getHttpServer())
      .get('/finance/periods').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    const currentPeriod = periods.body.find((p: any) => new Date(p.startDate) <= now && new Date(p.endDate) >= now);
    expect(currentPeriod).toBeDefined();

    await request(app.getHttpServer())
      .post(`/finance/periods/${currentPeriod.id}/close`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice: 10000, vatRatePct: 20 }] })
      .expect(201);

    // Issuing posts to the ledger dated today, which now falls in a closed period.
    const blocked = await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(400);
    expect(blocked.body.error.code).toBe('period.closed');

    await request(app.getHttpServer())
      .post(`/finance/periods/${currentPeriod.id}/reopen`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
  });

  it('numbering schemes are configurable and change the allocated format', async () => {
    const owner = await registerTenant('Numbering Ltd', `numbering-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    await request(app.getHttpServer())
      .put('/finance/settings/numbering/INVOICE')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ prefix: 'ACME', useYearToken: true, padding: 3 })
      .expect(200);

    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice: 5000, vatRatePct: 20 }] })
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    expect(issued.body.number).toMatch(new RegExp(`^ACME-${new Date().getFullYear()}-\\d{3}$`));
  });

  it('a manual journal must balance, posts correctly, and can be reversed', async () => {
    const owner = await registerTenant('Journal Ltd', `journal-${Date.now()}@test.local`);

    // Discover real account ids via the trial balance is impossible before any
    // posting exists, so seed one via a purchase invoice creation error is
    // also impossible — instead, issue a trivial sales invoice first, which
    // guarantees the default chart-of-accounts rows exist and lets us read
    // their ids back off the resulting ledger entries.
    const partyId = await createCustomer(owner);
    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Seed', quantity: 1, unitPrice: 1000, vatRatePct: 20 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    const seeded = await request(app.getHttpServer())
      .get(`/invoices/${draft.body.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    const bankAccount = seeded.body.ledgerEntries[0]; // Trade Debtors row; use its account for a self-contained journal instead
    const debtorsAccountId = bankAccount.accountId;
    const salesAccountId = seeded.body.ledgerEntries.find((e: any) => e.account.code === '4000').accountId;

    const unbalanced = await request(app.getHttpServer())
      .post('/finance/journals')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ narrative: 'Test', lines: [{ accountId: debtorsAccountId, debit: 500 }, { accountId: salesAccountId, credit: 400 }] })
      .expect(400);
    expect(unbalanced.body.error.code).toBe('journal.unbalanced');

    const journal = await request(app.getHttpServer())
      .post('/finance/journals')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ narrative: 'Opening balance adjustment', lines: [{ accountId: debtorsAccountId, debit: 500 }, { accountId: salesAccountId, credit: 500 }] })
      .expect(201);
    expect(journal.body.entries).toHaveLength(2);

    const reversal = await request(app.getHttpServer())
      .post(`/finance/journals/${journal.body.id}/reverse`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    expect(reversal.body.reversalOfJournalId).toBe(journal.body.id);
    expect(reversal.body.entries.find((e: any) => e.accountId === debtorsAccountId).credit).toBe('500');
  });

  it('an expense auto-approves and posts when no approval rule is configured', async () => {
    const owner = await registerTenant('Expense Ltd', `expense-${Date.now()}@test.local`);

    const created = await request(app.getHttpServer())
      .post('/expenses')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ category: 'Travel', date: new Date().toISOString(), description: 'Taxi', grossPence: 1200, vatRatePct: 20, paymentMethod: 'EMPLOYEE_PAID' })
      .expect(201);
    expect(created.body.status).toBe('DRAFT');

    const submitted = await request(app.getHttpServer())
      .post(`/expenses/${created.body.id}/submit`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    // No ApprovalRule exists for finance.expense -> workflow auto-approves.
    expect(submitted.body.status).toBe('APPROVED');

    const mine = await request(app.getHttpServer())
      .get('/expenses/mine').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].status).toBe('APPROVED');
  });

  it('rejects a duplicate purchase invoice (same supplier + number), and posts on approval', async () => {
    const owner = await registerTenant('AP Ltd', `ap-${Date.now()}@test.local`);
    const supplierId = await createSupplier(owner);

    // Reserve a document id via the documents upload-url step (a real file
    // never has to land in MinIO for this test — FR-PIN-002 only requires
    // the reference to exist, and the object storage layer is exercised by
    // documents.e2e-spec.ts already).
    const doc = await request(app.getHttpServer())
      .post('/documents/upload-url')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ filename: 'bill.pdf', mimeType: 'application/pdf', resourceType: 'PurchaseInvoice', resourceId: 'pending' })
      .expect(201);

    const body = {
      supplierId, number: 'SUPP-INV-001', invoiceDate: new Date().toISOString(), documentId: doc.body.documentId,
      lines: [{ description: 'Office supplies', nominalCode: '6000', quantity: 1, unitPrice: 10000, vatRatePct: 20 }],
    };
    const created = await request(app.getHttpServer())
      .post('/purchase-invoices')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send(body).expect(201);
    expect(created.body.grossTotal).toBe('12000');

    await request(app.getHttpServer())
      .post('/purchase-invoices')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send(body).expect(409);

    const submitted = await request(app.getHttpServer())
      .post(`/purchase-invoices/${created.body.id}/submit`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);
    expect(submitted.body.status).toBe('APPROVED');

    const payment = await request(app.getHttpServer())
      .post('/supplier-payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ supplierId, method: 'BANK_TRANSFER', amountPence: 12000 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/supplier-payments/${payment.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ purchaseInvoiceId: created.body.id, amountPence: 12000 })
      .expect(201);

    const finalInvoice = await request(app.getHttpServer())
      .get(`/purchase-invoices/${created.body.id}`).set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(finalInvoice.body.status).toBe('PAID');

    const agedPayables = await request(app.getHttpServer())
      .get('/reports/aged-payables').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(agedPayables.body).toEqual([]); // fully paid, nothing outstanding
  });

  it('profit and loss and balance sheet reflect a real posted invoice', async () => {
    const owner = await registerTenant('PL Ltd', `pl-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const draft = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Consulting', quantity: 1, unitPrice: 100000, vatRatePct: 20 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/invoices/${draft.body.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const pl = await request(app.getHttpServer())
      .get('/reports/profit-and-loss').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(pl.body.totalIncome).toBe('100000');
    expect(pl.body.netProfit).toBe('100000');

    const bs = await request(app.getHttpServer())
      .get('/reports/balance-sheet').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(bs.body.totalAssets).toBe('120000'); // Trade Debtors, gross
    expect(bs.body.totalLiabilities).toBe('20000'); // Output VAT owed
    expect(bs.body.retainedEarnings).toBe('100000');

    const csv = await request(app.getHttpServer())
      .get('/reports/profit-and-loss?format=csv').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(csv.text).toContain('Net profit');
    expect(csv.headers['content-type']).toContain('text/csv');
  });

  it('a repeated Idempotency-Key on payment recording does not create a second payment', async () => {
    const owner = await registerTenant('Idem Ltd', `idem-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const key = `test-key-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf).set('Idempotency-Key', key)
      .send({ partyId, method: 'CARD', amountPence: 5000 })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/payments')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf).set('Idempotency-Key', key)
      .send({ partyId, method: 'CARD', amountPence: 5000 })
      .expect(201);
    expect(second.body.id).toBe(first.body.id);

    const all = await request(app.getHttpServer())
      .get('/payments').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(all.body).toHaveLength(1);
  });
});
