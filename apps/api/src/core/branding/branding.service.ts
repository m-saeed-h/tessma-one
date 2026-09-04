import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

// Charter §7.4: resolveBranding(tenantId, context) — tenant override, then
// partner theme, then platform default. No module (and no screen in the web
// app) should hard-code a product name, logo, colour or support URL; they all
// call this instead. Only the resolution chain + data model are Phase 1 —
// the partner self-service console and custom domains are Phase 3 (§7.9).
//
// primaryColor and accentColor are the only two tokens a white-label theme
// swaps (design system rule: "structure never changes" — everything else the
// UI renders is a fixed platform token, not brand-configurable).
export interface ResolvedBranding {
  productName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  supportUrl: string | null;
}

const PLATFORM_DEFAULT: ResolvedBranding = {
  productName: 'Tessma One',
  logoUrl: null,
  primaryColor: '#175E7A',
  accentColor: '#B4832A',
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
        accentColor:
          tenant.branding?.accentColor ?? tenant.partner?.accentColor ?? PLATFORM_DEFAULT.accentColor,
        supportUrl:
          tenant.branding?.supportUrl ?? tenant.partner?.supportUrl ?? PLATFORM_DEFAULT.supportUrl,
      };
    });
  }
}
