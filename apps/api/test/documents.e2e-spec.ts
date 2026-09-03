/**
 * Documents platform service: proves the whole upload/confirm/download
 * round-trip against real object storage (MinIO), not a mock — including
 * that the API process never touches file bytes (it only signs URLs), that
 * tenant isolation holds for a signed download URL, and that the MIME
 * allowlist rejects a disallowed type before anything is stored.
 *
 * Requires MinIO reachable at S3_ENDPOINT/S3_PUBLIC_ENDPOINT (docker compose
 * up minio, or the full stack).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/shared/errors/http-exception.filter';

jest.setTimeout(30000);

describe('Documents platform service', () => {
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

  it('uploads a file directly to object storage, confirms it, and downloads it back byte-for-byte', async () => {
    const a = await registerTenant('Docs Test Ltd', `docs-${Date.now()}@test.local`);
    const fileContent = 'Sample receipt contents — proves round-trip integrity.';

    const created = await request(app.getHttpServer())
      .post('/documents/upload-url')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .send({ filename: 'receipt.txt', mimeType: 'text/plain', resourceType: 'Expense', resourceId: 'exp-1' })
      .expect(201);

    expect(created.body.documentId).toBeTruthy();
    expect(created.body.uploadUrl).toMatch(/^http/);

    // The API never sees these bytes — this PUT goes straight to MinIO,
    // exactly as a browser would follow the presigned URL.
    const putRes = await fetch(created.body.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: fileContent,
    });
    expect(putRes.ok).toBe(true);

    const confirmed = await request(app.getHttpServer())
      .post(`/documents/${created.body.documentId}/confirm`)
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .expect(201);
    expect(confirmed.body.status).toBe('UPLOADED');
    expect(Number(confirmed.body.sizeBytes)).toBe(Buffer.byteLength(fileContent));

    const downloadLink = await request(app.getHttpServer())
      .get(`/documents/${created.body.documentId}/download-url`)
      .set('Cookie', [`tsm_at=${a.at}`])
      .expect(200);

    const downloaded = await fetch(downloadLink.body.downloadUrl);
    const text = await downloaded.text();
    expect(text).toBe(fileContent);
  });

  it('rejects a disallowed file type before anything is stored', async () => {
    const a = await registerTenant('Docs Reject Ltd', `docs-reject-${Date.now()}@test.local`);
    await request(app.getHttpServer())
      .post('/documents/upload-url')
      .set('Cookie', [`tsm_at=${a.at}`])
      .set('X-CSRF-Token', a.csrf)
      .send({ filename: 'virus.exe', mimeType: 'application/x-msdownload', resourceType: 'Expense', resourceId: 'exp-2' })
      .expect(400);
  });

  it('tenant A cannot get a download link for tenant B\'s document', async () => {
    const stamp = Date.now();
    const a = await registerTenant('Docs Isolation A Ltd', `docs-iso-a-${stamp}@test.local`);
    const b = await registerTenant('Docs Isolation B Ltd', `docs-iso-b-${stamp}@test.local`);

    const created = await request(app.getHttpServer())
      .post('/documents/upload-url')
      .set('Cookie', [`tsm_at=${b.at}`])
      .set('X-CSRF-Token', b.csrf)
      .send({ filename: 'private.txt', mimeType: 'text/plain', resourceType: 'Expense', resourceId: 'exp-3' })
      .expect(201);

    // Tenant A's session, asking for tenant B's document id — RLS (tenantId
    // scoped by the transaction's app.current_tenant) means the row simply
    // isn't visible, so this 404s rather than leaking it.
    await request(app.getHttpServer())
      .get(`/documents/${created.body.documentId}/download-url`)
      .set('Cookie', [`tsm_at=${a.at}`])
      .expect(404);
  });
});
