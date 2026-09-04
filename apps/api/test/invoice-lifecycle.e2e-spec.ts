/**
 * Invoice lifecycle beyond the Stage 1 draft->issue slice: due date derived
 * from customer payment terms, cancellation requiring a mandatory reason and
 * producing a reversing ledger entry, and the credit limit check at issue
 * time (WARN lets it proceed with a flag; BLOCK refuses outright).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Invoice lifecycle', () => {
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

  async function createCustomer(owner: { at: string; csrf: string }, extra: Record<string, unknown> = {}) {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: `Cust ${Date.now()}`, ...extra })
      .expect(201);
    return res.body.id;
  }

  async function draftInvoice(owner: { at: string; csrf: string }, partyId: string, unitPrice = 10000) {
    const res = await request(app.getHttpServer())
      .post('/invoices/draft')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Work', quantity: 1, unitPrice, vatRatePct: 20 }] })
      .expect(201);
    return res.body;
  }

  it('due date is derived from the customer\'s payment terms', async () => {
    const owner = await registerTenant('Due Date Ltd', `duedate-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner, { paymentTerms: 14 });
    const draft = await draftInvoice(owner, partyId);

    const issued = await request(app.getHttpServer())
      .post(`/invoices/${draft.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    const issueDate = new Date(issued.body.issueDate).getTime();
    const dueDate = new Date(issued.body.dueDate).getTime();
    const daysDiff = Math.round((dueDate - issueDate) / 86_400_000);
    expect(daysDiff).toBe(14);
  });

  it('cancelling requires a reason, posts a reversing entry, and locks the invoice', async () => {
    const owner = await registerTenant('Cancel Ltd', `cancel-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);
    const draft = await draftInvoice(owner, partyId, 20000);
    const issued = await request(app.getHttpServer())
      .post(`/invoices/${draft.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .expect(201);

    // Missing reason is rejected by validation.
    await request(app.getHttpServer())
      .post(`/invoices/${issued.body.id}/cancel`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(400);

    const tbBefore = await request(app.getHttpServer())
      .get('/invoices/trial-balance').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(tbBefore.body['1100'].debit).toBe('24000'); // gross = 20000 net + 20% VAT (4000)

    const cancelled = await request(app.getHttpServer())
      .post(`/invoices/${issued.body.id}/cancel`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ reason: 'Raised in error' })
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancelledReason).toBe('Raised in error');

    // The reversing entry brings Debtors back to exactly zero net movement —
    // proves the reversal, not just a status flip.
    const tbAfter = await request(app.getHttpServer())
      .get('/invoices/trial-balance').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    const debtors = tbAfter.body['1100'];
    expect(BigInt(debtors.debit) - BigInt(debtors.credit)).toBe(0n);

    // Already cancelled — cannot cancel again.
    await request(app.getHttpServer())
      .post(`/invoices/${issued.body.id}/cancel`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ reason: 'Again' })
      .expect(400);
  });

  it('a BLOCK credit limit refuses to issue over the limit; WARN allows it with a flag', async () => {
    const owner = await registerTenant('Credit Limit Ltd', `credit-${Date.now()}@test.local`);

    const blockParty = await createCustomer(owner, { creditLimitPence: 5000, creditLimitBehaviour: 'BLOCK' });
    const blockDraft = await draftInvoice(owner, blockParty, 10000); // exceeds 5000 limit
    const blocked = await request(app.getHttpServer())
      .post(`/invoices/${blockDraft.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({});
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('invoice.credit_limit_exceeded');

    const warnParty = await createCustomer(owner, { creditLimitPence: 5000, creditLimitBehaviour: 'WARN' });
    const warnDraft = await draftInvoice(owner, warnParty, 10000);
    const warned = await request(app.getHttpServer())
      .post(`/invoices/${warnDraft.id}/issue`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(201);
    expect(warned.body.status).toBe('ISSUED'); // proceeded despite the breach
    expect(warned.body.creditWarning).toBeTruthy();
  });
});
