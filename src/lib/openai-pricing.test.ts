import { describe, expect, it } from 'vitest';
import { estimateCost, knownModels } from './openai-pricing';

describe('estimateCost', () => {
  it('returns 0 for unknown model', () => {
    expect(estimateCost('unknown-model', { prompt_tokens: 1000, completion_tokens: 1000 })).toBe(0);
  });

  it('calculates gpt-4o-mini cost', () => {
    const cost = estimateCost('gpt-4o-mini', {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.75, 4);
  });

  it('calculates embedding cost with zero output', () => {
    const cost = estimateCost('text-embedding-3-small', {
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
    });
    expect(cost).toBeCloseTo(0.02, 4);
  });
});

describe('knownModels', () => {
  it('returns array with at least gpt-4o-mini', () => {
    expect(knownModels()).toContain('gpt-4o-mini');
    expect(knownModels()).toContain('text-embedding-3-small');
  });
});
