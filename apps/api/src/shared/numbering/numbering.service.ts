import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// FR-SET-004/005/006: numbering sequences are configurable per document
// type, unique per tenant+type, and allocated at issue — not at draft
// creation, so an abandoned draft never leaves a gap. Shared by invoices,
// quotations and credit notes rather than each hand-rolling its own counter.
@Injectable()
export class NumberingService {
  // Atomic UPDATE ... RETURNING guarantees no two concurrent issues get the
  // same number (AP-08: one way to do this, not three copies of the pattern).
  async allocate(tx: Prisma.TransactionClient, tenantId: string, docType: string, prefix: string): Promise<string> {
    await tx.numberSequence.upsert({
      where: { tenantId_docType: { tenantId, docType } },
      update: {},
      create: { tenantId, docType, next: 1 },
    });
    const rows = await tx.$queryRawUnsafe<{ next: number }[]>(
      `UPDATE "NumberSequence" SET "next" = "next" + 1
       WHERE "tenantId" = $1 AND "docType" = $2 RETURNING "next" - 1 AS next`,
      tenantId, docType,
    );
    const n = rows[0].next;
    return `${prefix}-${String(n).padStart(5, '0')}`;
  }
}
