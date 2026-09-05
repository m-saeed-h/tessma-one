import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

// FR-LED-002: the chart of accounts, read-only from the API's point of view
// in this slice — it's seeded per tenant at registration and not yet
// user-editable (adding/renaming accounts is a reasonable later addition,
// not required by anything currently built against it).
@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) => tx.account.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }));
  }
}
