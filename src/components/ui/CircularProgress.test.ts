import { describe, expect, it } from 'vitest';
import { progressPercent } from './CircularProgress';

describe('progressPercent', () => {
  it('returns 0 when total is zero (indeterminate)', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(progressPercent(10, 22)).toBe(45);
    expect(progressPercent(1, 3)).toBe(33);
  });

  it('clamps to 100 when done exceeds total', () => {
    expect(progressPercent(30, 22)).toBe(100);
  });

  it('clamps to 0 for negative done', () => {
    expect(progressPercent(-1, 10)).toBe(0);
  });

  it('returns 100 when fully done', () => {
    expect(progressPercent(22, 22)).toBe(100);
  });
});
