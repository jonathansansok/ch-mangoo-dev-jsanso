import { describe, expect, it } from 'vitest';
import { parseDecimal, parseMoney } from './parse-money';

describe('parseMoney', () => {
  it('parses ARS with $', () => {
    const r = parseMoney('$1.234,56');
    expect(r.amount).toBe(1234.56);
    expect(r.currency).toBe('ARS');
  });

  it('parses USD with U$S', () => {
    const r = parseMoney('U$S 99,95');
    expect(r.amount).toBe(99.95);
    expect(r.currency).toBe('USD');
  });

  it('parses USD with USD suffix', () => {
    const r = parseMoney('1500 USD');
    expect(r.amount).toBe(1500);
    expect(r.currency).toBe('USD');
  });

  it('handles plain number string', () => {
    const r = parseMoney('1500');
    expect(r.amount).toBe(1500);
    expect(r.currency).toBeNull();
  });

  it('returns nulls for empty', () => {
    const r = parseMoney('');
    expect(r.amount).toBeNull();
    expect(r.currency).toBeNull();
  });

  it('returns nulls for non-numeric', () => {
    const r = parseMoney('abc');
    expect(r.amount).toBeNull();
  });

  it('passes through numbers', () => {
    const r = parseMoney(42.5);
    expect(r.amount).toBe(42.5);
  });
});

describe('parseDecimal', () => {
  it('parses comma as decimal', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
  });

  it('parses dot as decimal', () => {
    expect(parseDecimal('1.5')).toBe(1.5);
  });

  it('parses thousands with dot', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56);
  });

  it('parses thousands with comma', () => {
    expect(parseDecimal('1,234.56')).toBe(1234.56);
  });

  it('handles integers', () => {
    expect(parseDecimal('1000')).toBe(1000);
  });

  it('returns null for invalid', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
  });
});
