import { describe, it, expect } from 'vitest';
import { resolveDecision, type ResolveContext } from './resolve-decision';
import type { JudgeDecision } from './judge-schema';

function makeCtx(overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    refToOfferId: new Map([['O1', 100]]),
    refToRequestId: new Map([['O1R1', 200]]),
    shortlists: new Map([[100, [{ id: 200, similarity: 0.9 }]]]),
    requestById: new Map([[200, { quantity: 10, unit: 'unidad' }]]),
    verifierConfig: { minSimilarity: 0.55, qtyRatioMin: 0.1, qtyRatioMax: 3.0 },
    trustJudgeConfidence: 0.7,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<JudgeDecision> = {}): JudgeDecision {
  return {
    offerItemRef: 'O1',
    relation: 'match',
    requestItemRef: 'O1R1',
    confidence: 0.9,
    rationale_short: 'misma cosa',
    ...overrides,
  };
}

describe('resolveDecision', () => {
  it('refs válidos → ResolvableDecision con relation original', () => {
    const out = resolveDecision(makeDecision(), makeCtx());
    expect(out).toEqual({
      offerItemId: 100,
      requestItemId: 200,
      relation: 'match',
      confidence: 0.9,
      lowConfidence: false,
      rationale: 'misma cosa',
    });
  });

  it('offerItemRef alucinado → null (offer item se cae del resultado)', () => {
    const out = resolveDecision(makeDecision({ offerItemRef: 'O99' }), makeCtx());
    expect(out).toBeNull();
  });

  it('requestItemRef alucinado en match → degrada a extra+lowConfidence', () => {
    const out = resolveDecision(makeDecision({ requestItemRef: 'O99R99' }), makeCtx());
    expect(out).not.toBeNull();
    expect(out!.relation).toBe('extra');
    expect(out!.requestItemId).toBeNull();
    expect(out!.lowConfidence).toBe(true);
    expect(out!.rationale).toMatch(/inválida/i);
  });

  it('requestItemRef alucinado en partial_quantity → degrada a extra+lowConfidence', () => {
    const out = resolveDecision(
      makeDecision({ requestItemRef: 'O99R99', relation: 'partial_quantity' }),
      makeCtx(),
    );
    expect(out!.relation).toBe('extra');
    expect(out!.lowConfidence).toBe(true);
  });

  it('relation=extra con requestItemRef=null → válido sin requestItemId', () => {
    const out = resolveDecision(
      makeDecision({ relation: 'extra', requestItemRef: null, rationale_short: 'no calza' }),
      makeCtx(),
    );
    expect(out).toEqual({
      offerItemId: 100,
      requestItemId: null,
      relation: 'extra',
      confidence: 0.9,
      lowConfidence: false,
      rationale: 'no calza',
    });
  });

  it('similarity baja + confidence baja → lowConfidence=true', () => {
    const ctx = makeCtx({
      shortlists: new Map([[100, [{ id: 200, similarity: 0.4 }]]]),
    });
    const out = resolveDecision(makeDecision({ confidence: 0.6 }), ctx);
    expect(out!.relation).toBe('match');
    expect(out!.lowConfidence).toBe(true);
  });

  it('similarity baja + confidence alta → trust judge, no baja confianza', () => {
    const ctx = makeCtx({
      shortlists: new Map([[100, [{ id: 200, similarity: 0.4 }]]]),
    });
    const out = resolveDecision(makeDecision({ confidence: 0.95 }), ctx);
    expect(out!.relation).toBe('match');
    expect(out!.lowConfidence).toBe(false);
  });
});
