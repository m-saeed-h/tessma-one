import { Controller, Get, HttpCode } from '@nestjs/common';
import { Public } from '../permissions/permissions.decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';

// NFR-K8S-05 / NFR-K8S-06: liveness and readiness are separate. Liveness is
// "the process is up" (no dependency check); readiness is "can actually serve
// a request" (the database is reachable). Kubernetes readiness is a design
// constraint for Phase 1, not a Phase 1 deployment target (Charter §3.3) —
// these endpoints exist now because adding them later is free and testing
// them later is not.
@Controller()
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('health')
  @HttpCode(200)
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return { status: 'ready' };
  }
}
