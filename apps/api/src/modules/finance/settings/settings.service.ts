import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NumberingService } from '../../../shared/numbering/numbering.service';

interface FinanceProfileInput {
  legalName?: string; addressLine1?: string; addressLine2?: string; city?: string;
  postcode?: string; country?: string; vatNumber?: string; companyNumber?: string;
  footerText?: string; defaultPaymentTermsDays?: number;
  baseCurrency?: string; accountingBasis?: 'ACCRUAL' | 'CASH';
  financialYearStartMonth?: number; financialYearStartDay?: number;
}

const DEFAULT_PROFILE = {
  legalName: null, addressLine1: null, addressLine2: null, city: null,
  postcode: null, country: null, vatNumber: null, companyNumber: null, footerText: null,
  defaultPaymentTermsDays: 30, baseCurrency: 'GBP', baseCurrencyLockedAt: null,
  accountingBasis: 'ACCRUAL', financialYearStartMonth: 1, financialYearStartDay: 1,
};

@Injectable()
export class FinanceSettingsService {
  constructor(private prisma: PrismaService, private numbering: NumberingService) {}

  // Never returns a bare null: NestJS sends an empty response body (not the
  // JSON literal `null`) for a null/undefined controller return, which is
  // indistinguishable from a network error to a JSON client. An unconfigured
  // tenant gets this default-shaped object instead — also a friendlier shape
  // for a settings form to bind directly to.
  async get(tenantId: string) {
    const profile = await this.prisma.forTenant(tenantId, (tx) => tx.tenantFinanceProfile.findUnique({ where: { tenantId } }));
    return profile ?? { tenantId, ...DEFAULT_PROFILE };
  }

  // FR-SET-002: base currency is locked once the first transaction posts —
  // changing it after that would silently mis-state every prior balance.
  async upsert(tenantId: string, input: FinanceProfileInput) {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const current = await tx.tenantFinanceProfile.findUnique({ where: { tenantId } });
      const data: any = { ...input };

      if (input.baseCurrency !== undefined && input.baseCurrency !== (current?.baseCurrency ?? 'GBP')) {
        const hasPosted = (await tx.ledgerEntry.count({ where: { tenantId } })) > 0;
        if (hasPosted) {
          throw new BadRequestException({
            code: 'settings.currency_locked',
            message: 'The base currency is locked once the first transaction has posted.',
          });
        }
        data.baseCurrencyLockedAt = new Date();
      }

      return tx.tenantFinanceProfile.upsert({
        where: { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
    });
  }

  // Document types that actually allocate a number somewhere in this app —
  // kept in sync with the docType/defaultPrefix pairs each service passes to
  // NumberingService.allocate(). A tenant that hasn't issued anything of a
  // given type yet still sees it here, at its default configuration, rather
  // than the settings screen silently omitting a row until first use.
  private readonly KNOWN_DOC_TYPES: Record<string, string> = {
    INVOICE: 'INV', QUOTE: 'QUO', CREDIT_NOTE: 'CN',
  };

  async listNumberingSchemes(tenantId: string) {
    const existing = await this.numbering.listSchemes(tenantId);
    const byDocType = new Map(existing.map((s) => [s.docType, s]));
    return Object.entries(this.KNOWN_DOC_TYPES).map(([docType, defaultPrefix]) =>
      byDocType.get(docType) ?? { tenantId, docType, next: 1, prefix: defaultPrefix, suffix: '', useYearToken: false, padding: 5 },
    );
  }

  async configureNumbering(tenantId: string, docType: string, config: { prefix?: string; suffix?: string; useYearToken?: boolean; padding?: number }) {
    return this.numbering.configure(tenantId, docType, config);
  }
}
