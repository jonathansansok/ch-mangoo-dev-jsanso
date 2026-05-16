interface ModelPricing {
  input: number;
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export function estimateCost(model: string, usage: TokenUsage): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (
    (usage.prompt_tokens * pricing.input + usage.completion_tokens * pricing.output) / 1_000_000
  );
}

export function knownModels(): string[] {
  return Object.keys(PRICING);
}
