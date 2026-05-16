import { describe, expect, it } from 'vitest';
import {
  formatDateLong,
  formatDuration,
  formatPercent,
  formatPrice,
  formatQty,
  formatUsdCost,
} from './format';

describe('formatQty', () => {
  it('formats integers without decimals', () => {
    expect(formatQty(100)).toBe('100');
  });

  it('formats decimals with comma separator', () => {
    expect(formatQty(1234.5)).toBe('1.234,5');
  });

  it('returns em dash for null', () => {
    expect(formatQty(null)).toBe('—');
  });
});

describe('formatPrice', () => {
  it('formats with currency prefix', () => {
    expect(formatPrice(99.95, 'USD')).toBe('USD 99,95');
  });

  it('omits currency when null', () => {
    expect(formatPrice(99.95, null)).toBe('99,95');
  });
});

describe('formatUsdCost', () => {
  it('formats with 4 decimals', () => {
    expect(formatUsdCost(0.022)).toBe('US$ 0,0220');
  });

  it('handles tiny values', () => {
    expect(formatUsdCost(0.00001)).toBe('< US$ 0,0001');
  });
});

describe('formatPercent', () => {
  it('rounds to int', () => {
    expect(formatPercent(85.6)).toBe('86%');
  });
});

describe('formatDateLong', () => {
  it('formats date in es-AR', () => {
    const date = new Date('2026-05-15T17:00:00Z');
    const formatted = formatDateLong(date);
    expect(formatted).toContain('mayo');
    expect(formatted).toContain('2026');
  });

  it('returns em dash for invalid', () => {
    expect(formatDateLong(null)).toBe('—');
    expect(formatDateLong('not a date')).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats ms below 1s', () => {
    expect(formatDuration(500)).toBe('500 ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(2500)).toBe('2,5 s');
  });

  it('formats minutes', () => {
    expect(formatDuration(120_000)).toBe('2 min');
  });
});
