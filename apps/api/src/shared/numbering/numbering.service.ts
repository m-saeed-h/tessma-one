import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface SchemeConfig { prefix?: string; suffix?: string; useYearToken?: boolean; padding?: number; }
interface NumberSequenceRow { next: number; prefix: string; suffix: string; useYearToken: boolean; padding: number; }

// FR-SET-004/005/006: numbering sequences are configurable per document
// type (prefix, suffix, year token, padding — AP-09 "configuration, never a
// code branch"), unique per tenant+type, and allocated at issue — not at
// draft creation, so an abandoned draft never leaves a gap. Shared by
// invoices, quotations, credit notes and purchase invoices rather than each
// hand-rolling its own counter.
@Injectable()
export class NumberingService {
  constructor(private prisma: PrismaService) {}

  // Atomic UPDATE ... RETURNING guarantees no two concurrent issues get the
  // same number (AP-08: one way to do this, not three copies of the pattern).
  // `defaultPrefix` only seeds the row the first time this docType is used
  // for a tenant — after that, the tenant's own configured scheme (settable
  // via configure()) governs, never the call-site literal.
  async allocate(tx: Prisma.TransactionClient, tenantId: string, docType: string, defaultPrefix: string): Promise<string> {
    await tx.numberSequence.upsert({
      where: { tenantId_docType: { tenantId, docType } },
      update: {},
      create: { tenantId, docType, next: 1, prefix: defaultPrefix },
    });
    const rows = await tx.$queryRawUnsafe<NumberSequenceRow[]>(
      `UPDATE "NumberSequence" SET "next" = "next" + 1
       WHERE "tenantId" = $1 AND "docType" = $2
       RETURNING "next" - 1 AS next, "prefix", "suffix", "useYearToken", "padding"`,
      tenantId, docType,
    );
    return this.format(rows[0]);
  }

  private format(row: NumberSequenceRow): string {
    const yearToken = row.useYearToken ? `${new Date().getFullYear()}-` : '';
    return `${row.prefix}-${yearToken}${String(row.next).padStart(row.padding, '0')}${row.suffix}`;
  }

  async listSchemes(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) => tx.numberSequence.findMany({ where: { tenantId }, orderBy: { docType: 'asc' } }));
  }

  // US-FIN-002: "a preview of the next number is shown before saving" —
  // read-only, does not consume the sequence.
  async previewNext(tenantId: string, docType: string): Promise<string | null> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const row = await tx.numberSequence.findUnique({ where: { tenantId_docType: { tenantId, docType } } });
      if (!row) return null;
      return this.format(row);
    });
  }

  async configure(tenantId: string, docType: string, config: SchemeConfig) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.numberSequence.upsert({
        where: { tenantId_docType: { tenantId, docType } },
        update: config,
        create: { tenantId, docType, next: 1, ...config },
      }),
    );
  }
}
