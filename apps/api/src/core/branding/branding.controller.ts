import { Controller, Get, Req } from '@nestjs/common';
import { BrandingService } from './branding.service';

// Authenticated (not @Public): custom-domain resolution ahead of login is a
// Phase 3 capability (Charter §7.9). Today the web app fetches this once a
// tenant context exists and falls back to the platform default before that.
@Controller('branding')
export class BrandingController {
  constructor(private branding: BrandingService) {}

  @Get()
  async get(@Req() req: any) {
    return this.branding.resolve(req.ctx.tenantId);
  }
}
