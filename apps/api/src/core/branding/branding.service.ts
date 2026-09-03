import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Charter §7.4: resolveBranding(tenantId, context) — tenant override, then
// partner theme, then platform default. No module (and no screen in the web
// app) should hard-code a product name, logo, colour or support URL; they all
// call this instead. Only the resolution chain + data model are Phase 1 —
// the partner self-service console and custom domains are Phase 3 (§7.9).
export interface ResolvedBranding {
  productName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportUrl: string | null;
}

const PLATFORM_DEFAULT: ResolvedBranding = {
  productName: 'Tessma One',
  logoUrl: null,
  primaryColor: '#0f2942',
  supportUrl: null,
};

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  async resolve(tenantId: string): Promise<ResolvedBranding> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        include: { branding: true, partner: true },
      });

      return {
        productName:
          tenant.branding?.productName ?? tenant.partner?.brandName ?? PLATFORM_DEFAULT.productName,
        logoUrl: tenant.branding?.logoUrl ?? tenant.partner?.logoUrl ?? PLATFORM_DEFAULT.logoUrl,
        primaryColor:
          tenant.branding?.primaryColor ?? tenant.partner?.primaryColor ?? PLATFORM_DEFAULT.primaryColor,
        supportUrl:
          tenant.branding?.supportUrl ?? tenant.partner?.supportUrl ?? PLATFORM_DEFAULT.supportUrl,
      };
    });
  }
}
