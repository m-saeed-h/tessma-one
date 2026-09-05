import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import { PeriodsService } from '../../../shared/periods/periods.service';

interface JournalLineInput { accountId: string; debit?: number; credit?: number; }
interface CreateJournalInput { narrative: string; date?: string; lines: JournalLineInput[]; }

// FR-LED-004 to 008: the manual-posting path every other Finance feature
// posts around, not through — invoices/payments/credit notes post their own
// LedgerEntry rows directly and never touch this service. This is only for
// the postings a human types in by hand (adjustments, opening balances,
// corrections that don't fit a credit note).
@Injectable()
export class JournalsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private periods: PeriodsService) {}

  async create(tenantId: string, userId: string, input: CreateJournalInput) {
    if (input.lines.length < 2) {
      throw new BadRequestException({ code: 'journal.needs_two_lines', message: 'A journal needs at least two lines.' });
    }
    const debits = input.lines.reduce((s, l) => s + BigInt(l.debit ?? 0), 0n);
    const credits = input.lines.reduce((s, l) => s + BigInt(l.credit ?? 0), 0n);
    if (debits !== credits) {
      throw new BadRequestException({ code: 'journal.unbalanced', message: 'Debits must equal credits before this journal can be posted.' });
    }
    if (debits === 0n) {
      throw new BadRequestException({ code: 'journal.zero_value', message: 'A journal must post a non-zero amount.' });
    }

    return this.prisma.forTenant(tenantId, async (tx) => {
      const date = input.date ? new Date(input.date) : new Date();
      await this.periods.assertPeriodOpen(tx, tenantId, date);

      const accounts = await tx.account.findMany({ where: { tenantId, id: { in: input.lines.map((l) => l.accountId) } } });
      if (accounts.length !== new Set(input.lines.map((l) => l.accountId)).size) {
        throw new BadRequestException({ code: 'journal.unknown_account', message: 'One or more accounts were not found.' });
      }

      const journal = await tx.journal.create({
        data: {
          tenantId, narrative: input.narrative, postedByUserId: userId,
          entries: {
            create: input.lines.map((l) => ({
              tenantId, accountId: l.accountId, debit: BigInt(l.debit ?? 0), credit: BigInt(l.credit ?? 0),
              narrative: input.narrative, postedAt: date,
            })),
          },
        },
        include: { entries: { include: { account: true } } },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'journal.posted', resourceType: 'Journal',
        resourceId: journal.id, after: { narrative: input.narrative, totalPence: debits.toString() },
      });
      return journal;
    });
  }

  // FR-LED-007: reversal creates a new, linked journal with every line's
  // debit and credit swapped — the original journal and its entries are
  // never edited (BR-FIN-04).
  async reverse(tenantId: string, userId: string, journalId: string) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const original = await tx.journal.findUniqueOrThrow({ where: { id: journalId }, include: { entries: true } });
      await this.periods.assertPeriodOpen(tx, tenantId, new Date());

      const reversal = await tx.journal.create({
        data: {
          tenantId, narrative: `Reversal of: ${original.narrative}`, postedByUserId: userId,
          reversalOfJournalId: original.id,
          entries: {
            create: original.entries.map((e) => ({
              tenantId, accountId: e.accountId, debit: e.credit, credit: e.debit,
              narrative: `Reversal of: ${original.narrative}`,
            })),
          },
        },
        include: { entries: { include: { account: true } } },
      });
      await this.audit.write(tx, {
        tenantId, userId, action: 'journal.reversed', resourceType: 'Journal',
        resourceId: reversal.id, before: { originalJournalId: original.id },
      });
      return reversal;
    });
  }

  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.journal.findMany({
        where: { tenantId },
        include: { entries: { include: { account: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
