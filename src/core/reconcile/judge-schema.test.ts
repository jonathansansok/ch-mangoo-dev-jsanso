import { describe, it, expect } from 'vitest';
import { JudgeOutput } from './judge-schema';

describe('JudgeOutput schema', () => {
  it('acepta decisions con relation match', () => {
    const r = JudgeOutput.safeParse({
      decisions: [
        {
          offerItemRef: 'O1',
          relation: 'match',
          requestItemRef: 'O1R1',
          confidence: 0.92,
          rationale_short: 'misma cosa',
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza confidence > 1', () => {
    const r = JudgeOutput.safeParse({
      decisions: [
        {
          offerItemRef: 'O1',
          relation: 'match',
          requestItemRef: 'O1R1',
          confidence: 1.5,
          rationale_short: 'x',
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza relation desconocida', () => {
    const r = JudgeOutput.safeParse({
      decisions: [
        {
          offerItemRef: 'O1',
          relation: 'maybe',
          requestItemRef: null,
          confidence: 0.5,
          rationale_short: 'x',
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza decisions vacío', () => {
    const r = JudgeOutput.safeParse({ decisions: [] });
    expect(r.success).toBe(false);
  });

  it('acepta extra con requestItemRef null', () => {
    const r = JudgeOutput.safeParse({
      decisions: [
        {
          offerItemRef: 'O1',
          relation: 'extra',
          requestItemRef: null,
          confidence: 0.4,
          rationale_short: 'no calza',
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rechaza rationale > 280 chars', () => {
    const r = JudgeOutput.safeParse({
      decisions: [
        {
          offerItemRef: 'O1',
          relation: 'match',
          requestItemRef: 'O1R1',
          confidence: 0.9,
          rationale_short: 'x'.repeat(281),
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
