import { describe, expect, it } from 'vitest';
import { cosine, dot, magnitude } from './cosine';

describe('dot', () => {
  it('computes dot product', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('throws on dim mismatch', () => {
    expect(() => dot([1, 2], [1, 2, 3])).toThrow();
  });
});

describe('magnitude', () => {
  it('computes euclidean norm', () => {
    expect(magnitude([3, 4])).toBe(5);
  });

  it('returns 0 for zero vector', () => {
    expect(magnitude([0, 0, 0])).toBe(0);
  });
});

describe('cosine', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns positive for similar vectors', () => {
    expect(cosine([1, 1, 0], [1, 0.5, 0])).toBeGreaterThan(0.5);
  });

  it('returns 0 for zero vector', () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
