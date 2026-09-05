import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

interface FinanceProfileInput {
  legalName?: string; addressLine1?: string; addressLine2?: string; city?: string;
  postcode?: string; country?: string; vatNumber?: string; companyNumber?: string;
  footerText?: string; defaultPaymentTermsDays?: number;
}

@Injectable()
export class FinanceSettingsService {
  constructor(private prisma: PrismaService) {}

  // Never returns a bare null: NestJS sends an empty response body (not the
  // JSON literal `null`) for a null/undefined controller return, which is
  // indistinguishable from a network error to a JSON client. An unconfigured
  // tenant gets this default-shaped object instead — also a friendlier shape
  // for a settings form to bind directly to.
  async get(tenantId: string) {
    const profile = await this.prisma.forTenant(tenantId, (tx) => tx.tenantFinanceProfile.findUnique({ where: { tenantId } }));
    return profile ?? {
      tenantId, legalName: null, addressLine1: null, addressLine2: null, city: null,
      postcode: null, country: null, vatNumber: null, companyNumber: null, footerText: null,
      defaultPaymentTermsDays: 30,
    };
  }

  async upsert(tenantId: string, input: FinanceProfileInput) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.tenantFinanceProfile.upsert({
        where: { tenantId },
        create: { tenantId, ...input },
        update: input,
      }),
    );
  }
}
