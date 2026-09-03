import type { AiCompletionRequest, AiCompletionResult, AiProvider } from './ai-provider.interface';

// Deterministic, no-network provider. Not a stand-in for a real model's
// quality — it exists so the Gateway's plumbing (redaction, per-tenant
// metering, audit, the AI kill switch) is provably correct in dev and CI
// without depending on an external API key existing in every environment.
// Choosing and contracting a real provider (with a data-processing agreement
// that prohibits training on submitted content — AI safety rule 8) is a
// product decision, not something to fake here.
export class NullProvider implements AiProvider {
  readonly name = 'null-dev';

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return {
      output: `[dev-provider] no live model configured — echoing task "${req.task}"`,
      confidence: 0,
    };
  }
}
