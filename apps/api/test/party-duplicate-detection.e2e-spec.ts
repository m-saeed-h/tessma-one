/**
 * FR-PTY-008: probable duplicates (by name, company number, VAT number,
 * email) are warned about before saving — a real two-step API contract (409
 * with candidates, then resubmit with confirmDuplicate: true), not a
 * fire-and-forget log line.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Party duplicate detection', () => {
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

  it('warns on a probable duplicate name and only creates it once confirmed', async () => {
    const stamp = Date.now();
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company: 'Dup Test Ltd', email: `dup-${stamp}@test.local`, password: 'password123', name: 'Owner' })
      .expect(201);
    const owner = { at: cookie(res, 'tsm_at'), csrf: cookie(res, 'tsm_csrf') };

    await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: 'Acme Retail Limited' })
      .expect(201);

    const warned = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: 'acme retail limited' }); // case-insensitive match
    expect(warned.status).toBe(409);
    expect(warned.body.error.code).toBe('party.possible_duplicate');
    expect(warned.body.error.details.possibleDuplicates.length).toBeGreaterThan(0);

    const confirmed = await request(app.getHttpServer())
      .post('/customers')
      .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
      .send({ legalName: 'acme retail limited', confirmDuplicate: true })
      .expect(201);
    expect(confirmed.body.id).toBeTruthy();

    const list = await request(app.getHttpServer())
      .get('/customers').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
    expect(list.body.length).toBe(2);
  });
});
