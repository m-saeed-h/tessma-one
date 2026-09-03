// Charter §9.1: "Module -> AI Gateway -> { LLM provider A | LLM provider B |
// OCR engine | ... }" — modules never call a provider directly. This is the
// shape every provider must satisfy so swapping one in is a configuration
// change, not a rewrite (Charter §8: "Model choice becomes a configuration
// and cost decision rather than a rewrite").
export interface AiCompletionRequest {
  task: string;
  prompt: string;
  promptVersion: string;
}

export interface AiCompletionResult {
  output: string;
  confidence: number; // 0-1; AI safety rule 7 — every extracted/generated field carries a confidence value.
}

export interface AiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}
