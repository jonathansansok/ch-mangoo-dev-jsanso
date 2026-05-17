import { describe, it, expect } from 'vitest';
import { resolveConflicts, type ResolvableDecision } from './conflict-resolution';

function make(overrides: Partial<ResolvableDecision>): ResolvableDecision {
  return {
    offerItemId: 1,
    requestItemId: 10,
    relation: 'match',
    confidence: 0.9,
    lowConfidence: false,
    rationale: 'ok',
    ...overrides,
  };
}

describe('resolveConflicts', () => {
  it('mantiene match único', () => {
    const out = resolveConflicts([make({ offerItemId: 1, requestItemId: 10 })]);
    expect(out[0]!.relation).toBe('match');
  });

  it('dos offer items al mismo request: gana mayor confianza, otro pasa a extra', () => {
    const out = resolveConflicts([
      make({ offerItemId: 1, requestItemId: 10, confidence: 0.7 }),
      make({ offerItemId: 2, requestItemId: 10, confidence: 0.95 }),
    ]);
    const byOffer = new Map(out.map((d) => [d.offerItemId, d]));
    expect(byOffer.get(2)!.relation).toBe('match');
    expect(byOffer.get(1)!.relation).toBe('extra');
    expect(byOffer.get(1)!.requestItemId).toBeNull();
  });

  it('extras quedan extras sin cambio', () => {
    const out = resolveConflicts([
      make({ offerItemId: 3, requestItemId: null, relation: 'extra', rationale: 'na' }),
    ]);
    expect(out[0]!.relation).toBe('extra');
  });

  it('items con lowConfidence no compiten por ganador y preservan su relación', () => {
    const out = resolveConflicts([
      make({ offerItemId: 1, requestItemId: 10, confidence: 0.99, lowConfidence: true }),
      make({ offerItemId: 2, requestItemId: 10, confidence: 0.7, lowConfidence: false }),
    ]);
    const byOffer = new Map(out.map((d) => [d.offerItemId, d]));
    expect(byOffer.get(1)!.relation).toBe('match');
    expect(byOffer.get(1)!.lowConfidence).toBe(true);
    expect(byOffer.get(2)!.relation).toBe('match');
    expect(byOffer.get(2)!.lowConfidence).toBe(false);
  });
});
