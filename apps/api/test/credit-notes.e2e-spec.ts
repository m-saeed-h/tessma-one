/**
 * Credit notes (FR-CRN): a standard credit reverses Sales, a BAD_DEBT credit
 * posts to the bad-debt expense account instead (the sale happened; it's the
 * collectability that failed) — these are different ledger postings, not
 * just a different label. Also: allocation caps at both the credit note's
 * remaining balance and the invoice's outstanding balance (BR-FIN-07).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Credit notes', () => {
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

  it('a standard credit note reverses Sales; a bad-debt credit note posts to bad-debt expense instead', async () => {
    const owner = await registerTenant('Credit Note Ltd', `creditnote-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    // Two separate invoices so each credit note's effect is isolated.
    const invA = await issuedInvoice(owner, partyId, 10000);
    const invB = await issuedInvoice(owner, partyId, 20000);

    const standard = await request(app.getHttpServer())
      .post('/credit-notes')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({
        partyId, invoiceId: invA.id, reasonCode: 'RETURN', reasonText: 'Goods returned',
        lines: [{ description: 'Work', quantity: 1, unitPrice: 10000, vatRatePct: 20 }],
      })
      .expect(201);
    expect(standard.body.number).toMatch(/^CN-\d{5}$/);

    const badDebt = await request(app.getHttpServer())
      .post('/credit-notes')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({
        partyId, invoiceId: invB.id, reasonCode: 'BAD_DEBT', reasonText: 'Customer insolvent',
        lines: [{ description: 'Work', quantity: 1, unitPrice: 20000, vatRatePct: 20 }],
      })
      .expect(201);

    const tb = await request(app.getHttpServer())
      .get('/invoices/trial-balance').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);

    // Standard credit note: net (10000) reversed through Sales (4000).
    expect(BigInt(tb.body['4000'].debit)).toBe(10000n);
    // Bad debt: net (20000) goes to Bad Debt Write-off (7900), NOT Sales.
    expect(BigInt(tb.body['7900'].debit)).toBe(20000n);
    // Both reduce Debtors by their gross amount (12000 + 24000 = 36000),
    // on top of the original two issued invoices crediting nothing yet.
    expect(BigInt(tb.body['1100'].credit)).toBe(12000n + 24000n);
    // VAT relief: both credits reduce Output VAT.
    expect(BigInt(tb.body['2200'].debit)).toBe(2000n + 4000n);
  });

  it('allocating a credit note caps at both its own remaining balance and the invoice\'s outstanding balance', async () => {
    const owner = await registerTenant('Credit Allocate Ltd', `credit-alloc-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const invoice = await issuedInvoice(owner, partyId, 10000); // gross 12000

    const credit = await request(app.getHttpServer())
      .post('/credit-notes')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({
        partyId, reasonCode: 'GOODWILL', reasonText: 'Goodwill gesture',
        lines: [{ description: 'Goodwill', quantity: 1, unitPrice: 5000, vatRatePct: 20 }], // gross 6000
      })
      .expect(201);

    // Exceeds the credit note's own gross (6000).
    const tooMuch = await request(app.getHttpServer())
      .post(`/credit-notes/${credit.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 7000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error.code).toBe('creditnote.exceeds_remaining');

    const allocated = await request(app.getHttpServer())
      .post(`/credit-notes/${credit.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 6000 })
      .expect(201);
    expect(allocated.body.invoice.status).toBe('PARTIALLY_PAID');
    expect(allocated.body.invoice.allocatedTotal).toBe('6000');

    // Now try to allocate a second (fresh) credit note beyond what's left
    // outstanding on the invoice (12000 - 6000 = 6000 remaining).
    const credit2 = await request(app.getHttpServer())
      .post('/credit-notes')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({
        partyId, reasonCode: 'OTHER', reasonText: 'Second credit',
        lines: [{ description: 'X', quantity: 1, unitPrice: 10000, vatRatePct: 20 }], // gross 12000
      })
      .expect(201);
    const exceedsInvoice = await request(app.getHttpServer())
      .post(`/credit-notes/${credit2.body.id}/allocate`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ invoiceId: invoice.id, amountPence: 8000 });
    expect(exceedsInvoice.status).toBe(400);
    expect(exceedsInvoice.body.error.code).toBe('creditnote.exceeds_invoice_outstanding');
  });
});
