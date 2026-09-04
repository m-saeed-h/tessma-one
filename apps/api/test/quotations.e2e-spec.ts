/**
 * Quotations (FR-QUO): convert only works from ACCEPTED, an expired
 * quotation needs an explicit override to convert, and conversion carries
 * line detail across exactly (proving it isn't re-keyed).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Quotations', () => {
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

  it('cannot convert before acceptance, converts once accepted, and carries line detail exactly', async () => {
    const owner = await registerTenant('Quote Test Ltd', `quote-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const quote = await request(app.getHttpServer())
      .post('/quotations')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, lines: [{ description: 'Bespoke work', quantity: 2, unitPrice: 7500, vatRatePct: 20 }] })
      .expect(201);
    expect(quote.body.number).toMatch(/^QUO-\d{5}$/);

    const tooEarly = await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/convert`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({});
    expect(tooEarly.status).toBe(400);

    await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'ACCEPTED' })
      .expect(201);

    const invoice = await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/convert`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({})
      .expect(201);

    expect(invoice.body.status).toBe('DRAFT');
    expect(invoice.body.sourceQuotationId).toBe(quote.body.id);
    expect(invoice.body.grossTotal).toBe(quote.body.grossTotal);
    expect(invoice.body.lines[0].description).toBe('Bespoke work');
    expect(invoice.body.lines[0].quantity).toBe(2);
  });

  it('an expired quotation needs an explicit override to convert', async () => {
    const owner = await registerTenant('Expired Quote Ltd', `expired-quote-${Date.now()}@test.local`);
    const partyId = await createCustomer(owner);

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const quote = await request(app.getHttpServer())
      .post('/quotations')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ partyId, expiryDate: pastDate, lines: [{ description: 'Work', quantity: 1, unitPrice: 1000 }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/decide`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ decision: 'ACCEPTED' })
      .expect(201);

    const refused = await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/convert`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({});
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('quotation.expired');

    await request(app.getHttpServer())
      .post(`/quotations/${quote.body.id}/convert`)
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ allowExpired: true })
      .expect(201);
  });
});
