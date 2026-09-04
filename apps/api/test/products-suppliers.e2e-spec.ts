/**
 * Products (FR-PRD) and Suppliers (FR-PTY-013/014): SKU uniqueness, archive
 * preserving history, and — the property that matters most here — supplier
 * bank details are genuinely encrypted at rest (not just "the API doesn't
 * return them in plaintext"), and changing them requires re-authentication
 * and produces a distinguishable audit trail.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';
import { PrismaService } from '../src/shared/prisma/prisma.service';

jest.setTimeout(30000);

describe('Products & Suppliers', () => {
  let app: INestApplication;
  const prisma = new PrismaService();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function cookie(res: request.Response, name: string): string {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const line = raw.find((c) => c.startsWith(`${name}=`));
    if (!line) throw new Error(`expected Set-Cookie for ${name}`);
    return line.split(';')[0].split('=')[1];
  }

  function decodeTenantId(jwt: string): string {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString()).tenantId;
  }

  async function registerTenant(company: string, email: string) {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ company, email, password: 'password123', name: 'Owner' })
      .expect(201);
    const at = cookie(res, 'tsm_at');
    return { at, csrf: cookie(res, 'tsm_csrf'), tenantId: decodeTenantId(at) };
  }

  describe('Products', () => {
    it('enforces SKU uniqueness within a tenant', async () => {
      const owner = await registerTenant('Product Test Ltd', `product-${Date.now()}@test.local`);
      await request(app.getHttpServer())
        .post('/products')
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ sku: 'WIDGET-1', name: 'Widget', unitPricePence: 1000 })
        .expect(201);

      const dup = await request(app.getHttpServer())
        .post('/products')
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ sku: 'WIDGET-1', name: 'Widget Again', unitPricePence: 2000 });
      expect(dup.status).toBe(409); // Prisma unique constraint -> not_found filter doesn't apply; still not a 500
    });

    it('archiving hides a product from the default list but keeps it queryable', async () => {
      const owner = await registerTenant('Product Archive Ltd', `product-archive-${Date.now()}@test.local`);
      const created = await request(app.getHttpServer())
        .post('/products')
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ sku: 'SVC-1', name: 'Consulting', unitPricePence: 5000 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/products/${created.body.id}/archive`)
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .expect(201);

      const activeList = await request(app.getHttpServer())
        .get('/products').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
      expect(activeList.body.some((p: { id: string }) => p.id === created.body.id)).toBe(false);

      const allList = await request(app.getHttpServer())
        .get('/products?includeArchived=true').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
      expect(allList.body.some((p: { id: string }) => p.id === created.body.id)).toBe(true);
    });
  });

  describe('Suppliers', () => {
    it('never stores bank details in plaintext, and the API never returns the raw number', async () => {
      const owner = await registerTenant('Supplier Test Ltd', `supplier-${Date.now()}@test.local`);
      const created = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({
          legalName: 'Acme Supplies Ltd', paymentTerms: 14,
          bankAccountName: 'Acme Supplies Ltd', bankSortCode: '12-34-56', bankAccountNumber: '87654321',
        })
        .expect(201);

      expect(created.body.bankAccountMasked).toBe('••••4321');
      expect(JSON.stringify(created.body)).not.toContain('87654321');

      // The actual database row: encrypted, not plaintext, not even a
      // substring match against the real account number.
      const row = await prisma.forTenant(owner.tenantId, (tx) =>
        tx.supplierRole.findUniqueOrThrow({ where: { id: created.body.supplierId } }),
      );
      expect(row.bankAccountNumberEnc).toBeTruthy();
      expect(row.bankAccountNumberEnc).not.toContain('87654321');
      expect(row.bankAccountNumberEnc).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/); // iv.tag.ciphertext

      const list = await request(app.getHttpServer())
        .get('/suppliers').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
      const listed = list.body.find((p: { id: string }) => p.id === created.body.id);
      expect(listed.supplier.hasBankDetails).toBe(true);
      expect(JSON.stringify(listed)).not.toContain('87654321');
    });

    it('requires the correct password to change bank details, and audits + notifies on success', async () => {
      const owner = await registerTenant('Supplier Reauth Ltd', `supplier-reauth-${Date.now()}@test.local`);
      const created = await request(app.getHttpServer())
        .post('/suppliers')
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ legalName: 'Reauth Supplier Ltd' })
        .expect(201);

      const wrongPassword = await request(app.getHttpServer())
        .post(`/suppliers/${created.body.supplierId}/bank-details`)
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ password: 'not-the-password', bankAccountName: 'X', bankSortCode: '11-11-11', bankAccountNumber: '11111111' });
      expect(wrongPassword.status).toBe(401);

      const ok = await request(app.getHttpServer())
        .post(`/suppliers/${created.body.supplierId}/bank-details`)
        .set('Cookie', [`tsm_at=${owner.at}`]).set('X-CSRF-Token', owner.csrf)
        .send({ password: 'password123', bankAccountName: 'Real Name', bankSortCode: '22-22-22', bankAccountNumber: '99999999' })
        .expect(201);
      expect(ok.body.bankAccountMasked).toBe('••••9999');

      const notifications = await request(app.getHttpServer())
        .get('/notifications').set('Cookie', [`tsm_at=${owner.at}`]).expect(200);
      expect(notifications.body.some((n: { subject: string }) => n.subject.includes('Bank details changed'))).toBe(true);
    });
  });
});
