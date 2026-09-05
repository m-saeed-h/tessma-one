import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { serialise } from '../../../shared/http/serialise';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { JournalsService } from './journals.service';

const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debit: z.number().int().min(0).optional(),
  credit: z.number().int().min(0).optional(),
});
const createJournalSchema = z.object({
  narrative: z.string().trim().min(1).max(500),
  date: z.string().datetime().optional(),
  lines: z.array(journalLineSchema).min(2).max(50),
});

@Controller('finance/journals')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class JournalsController {
  constructor(private journals: JournalsService, private idempotency: IdempotencyService) {}

  @RequirePermissions(PERMISSIONS.JOURNAL_POST)
  @Post()
  async create(@Req() req: any, @Body() body: unknown, @Headers('idempotency-key') idempotencyKey?: string) {
    const b = validate(createJournalSchema, body);
    return this.idempotency.wrap(req.ctx.tenantId, 'journals.create', idempotencyKey, () =>
      this.journals.create(req.ctx.tenantId, req.ctx.userId, b).then(serialise),
    );
  }

  @RequirePermissions(PERMISSIONS.JOURNAL_READ)
  @Get()
  async list(@Req() req: any) {
    return serialise(await this.journals.list(req.ctx.tenantId));
  }

  @RequirePermissions(PERMISSIONS.JOURNAL_POST)
  @Post(':id/reverse')
  async reverse(@Req() req: any, @Param('id') id: string) {
    return serialise(await this.journals.reverse(req.ctx.tenantId, req.ctx.userId, id));
  }
}
