import { Body, Controller, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { validate } from '../../shared/validation/validate';
import { AiGatewayService } from './ai-gateway.service';

const completeSchema = z.object({
  task: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(20_000),
});

@Controller('ai')
export class AiGatewayController {
  constructor(private ai: AiGatewayService) {}

  @Post('complete')
  async complete(@Req() req: any, @Body() body: unknown) {
    const b = validate(completeSchema, body);
    const { tenantId, userId } = req.ctx;
    return this.ai.complete(tenantId, userId, b.task, b.prompt);
  }
}
