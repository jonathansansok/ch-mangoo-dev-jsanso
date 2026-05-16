import { describe, expect, it } from 'vitest';
import { shortlistFor } from './shortlist';

describe('shortlistFor', () => {
  const pool = [
    { id: 1, vector: [1, 0, 0] },
    { id: 2, vector: [0.9, 0.1, 0] },
    { id: 3, vector: [0, 1, 0] },
    { id: 4, vector: [0, 0, 1] },
    { id: 5, vector: [0.5, 0.5, 0] },
  ];

  it('returns top-K sorted by similarity', () => {
    const result = shortlistFor([1, 0, 0], pool, 3);
    expect(result).toHaveLength(3);
    expect(result[0]?.id).toBe(1);
    expect(result[1]?.id).toBe(2);
    expect(result[0]?.similarity).toBeGreaterThan(result[1]?.similarity ?? 0);
  });

  it('respects K limit', () => {
    expect(shortlistFor([1, 0, 0], pool, 2)).toHaveLength(2);
  });

  it('handles K larger than pool', () => {
    expect(shortlistFor([1, 0, 0], pool, 10)).toHaveLength(5);
  });
});
