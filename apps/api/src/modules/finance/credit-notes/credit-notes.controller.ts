import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../core/permissions/permissions.decorators';
import { PERMISSIONS } from '../../../core/permissions/permissions.registry';
import { RequireEntitlement } from '../../../core/subscriptions/entitlements.decorators';
import { FEATURE_KEYS } from '../../../core/subscriptions/entitlements.registry';
import { validate } from '../../../shared/validation/validate';
import { allocateCreditNoteSchema, createCreditNoteSchema } from '../../../shared/validation/schemas';
import { serialise } from '../../../shared/http/serialise';
import { CreditNotesService } from './credit-notes.service';

const listQuerySchema = z.object({ partyId: z.string().uuid().optional() });

@Controller('credit-notes')
@RequireEntitlement(FEATURE_KEYS.FINANCE)
export class CreditNotesController {
  constructor(private creditNotes: CreditNotesService) {}

  @RequirePermissions(PERMISSIONS.CREDIT_NOTE_CREATE)
  @Post()
  async create(@Req() req: any, @Body() body: unknown) {
    const b = validate(createCreditNoteSchema, body);
    return serialise(await this.creditNotes.create(req.ctx.tenantId, req.ctx.userId, b));
  }

  @RequirePermissions(PERMISSIONS.CREDIT_NOTE_READ)
  @Get()
  async list(@Req() req: any, @Query() query: unknown) {
    const q = validate(listQuerySchema, query);
    return serialise(await this.creditNotes.list(req.ctx.tenantId, q.partyId));
  }

  @RequirePermissions(PERMISSIONS.CREDIT_NOTE_CREATE)
  @Post(':id/allocate')
  async allocate(@Req() req: any, @Param('id') id: string, @Body() body: unknown) {
    const b = validate(allocateCreditNoteSchema, body);
    const { tenantId, userId } = req.ctx;
    return serialise(await this.creditNotes.allocateToInvoice(tenantId, userId, id, b.invoiceId, b.amountPence));
  }
}
