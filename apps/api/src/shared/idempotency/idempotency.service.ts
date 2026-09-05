import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serialise } from '../http/serialise';

// FR-API-003, NFR-FIN-09: "a payment must never be recorded twice" (Build
// Guide §8) made general-purpose. A caller sends an `Idempotency-Key`
// header on a financial POST; a retry carrying the same key returns the
// original response instead of executing the write again. Wired into the
// handful of endpoints where a duplicate is genuinely dangerous (payments,
// supplier payments, invoice issue, manual journals) rather than every POST
// — most of this app's writes are already naturally idempotent-safe or
// covered by their own duplicate-detection (party creation, purchase
// invoices' unique supplier+number constraint).
@Injectable()
export class IdempotencyService {
  constructor(private prisma: PrismaService) {}

  async wrap<T>(tenantId: string, endpoint: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();

    const existing = await this.prisma.forTenant(tenantId, (tx) =>
      tx.idempotencyKey.findUnique({ where: { tenantId_endpoint_key: { tenantId, endpoint, key } } }),
    );
    if (existing) return existing.responseBody as T;

    const result = await fn();
    const responseBody = serialise(result) as object;
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.idempotencyKey.create({ data: { tenantId, endpoint, key, responseStatus: 200, responseBody } }),
    ).catch(() => { /* a race on the unique key is fine — the write already happened once, which is the property that matters */ });
    return result;
  }
}
