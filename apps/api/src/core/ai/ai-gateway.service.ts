import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { redact } from './redaction';
import { NullProvider } from './null-provider';
import type { AiProvider } from './ai-provider.interface';

const PROMPT_VERSION = 'v1';

export interface AiCompletionResponse {
  output: string;
  confidence: number;
  // AI safety rule 5: every AI-touched record carries a state of Suggested,
  // Confirmed or Posted. A Gateway response is never anything but Suggested —
  // confirmation/posting is a deterministic, permission-checked module
  // action on the caller's side, never something the Gateway does itself.
  state: 'Suggested';
}

// Charter §9.1: every module calls this, never a provider directly. Owns
// model routing (today: a single NullProvider — routing to "cheap model for
// classification, strong model for reasoning" arrives with a second real
// provider), tenant context, redaction, per-tenant metering, and the full
// audit trail (AI safety rule 11).
@Injectable()
export class AiGatewayService {
  private provider: AiProvider = new NullProvider();

  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async complete(tenantId: string, userId: string, task: string, prompt: string): Promise<AiCompletionResponse> {
    return this.prisma.forTenant(tenantId, async (tx) => {
      const sub = await tx.tenantSubscription.findUnique({ where: { tenantId } });
      // AI safety rule 12: a tenant administrator can disable AI entirely.
      if (!sub?.aiEnabled) {
        throw new ForbiddenException({ code: 'ai.disabled', message: 'AI features are disabled for this tenant.' });
      }

      const { text: redactedPrompt, redacted } = redact(prompt);
      const result = await this.provider.complete({ task, prompt: redactedPrompt, promptVersion: PROMPT_VERSION });

      await tx.aiUsageEvent.create({
        data: {
          tenantId, userId, task, provider: this.provider.name,
          promptVersion: PROMPT_VERSION, redacted, confidence: result.confidence,
        },
      });
      // AI safety rule 11: full request/response audit correlated to the business action.
      await this.audit.write(tx, {
        tenantId, userId, action: 'ai.completion', resourceType: 'AiUsageEvent', resourceId: task,
        after: { provider: this.provider.name, confidence: result.confidence, redacted },
      });

      return { output: result.output, confidence: result.confidence, state: 'Suggested' };
    });
  }
}
