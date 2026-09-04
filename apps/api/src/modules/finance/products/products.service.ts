import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

interface CreateProductInput {
  sku: string; type?: 'PRODUCT' | 'SERVICE'; name: string; description?: string; unit?: string;
  unitPricePence: number; purchasePricePence?: number; vatRatePct?: number;
  vatTreatment?: 'STANDARD' | 'REDUCED' | 'ZERO' | 'EXEMPT' | 'OUTSIDE_SCOPE';
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, b: CreateProductInput) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.product.create({
        data: {
          tenantId, sku: b.sku, type: b.type ?? 'SERVICE', name: b.name, description: b.description,
          unit: b.unit ?? 'each', unitPrice: BigInt(b.unitPricePence),
          purchasePrice: b.purchasePricePence !== undefined ? BigInt(b.purchasePricePence) : undefined,
          vatRatePct: b.vatRatePct ?? 20, vatTreatment: b.vatTreatment ?? 'STANDARD',
        },
      }),
    );
  }

  // FR-PRD-005: archiving preserves historical transaction integrity — a
  // Product is never deleted once it may have been referenced by an issued
  // invoice line (invoice lines store their own copy of price/description at
  // the time, so archiving here doesn't touch anything already posted).
  async archive(tenantId: string, id: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.product.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
  }

  async list(tenantId: string, includeArchived: boolean) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.product.findMany({
        where: includeArchived ? undefined : { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      }),
    );
  }
}
