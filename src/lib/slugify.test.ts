import { describe, expect, it } from 'vitest';
import { sha256Short, slugify } from './slugify';

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Hola Mundo')).toBe('hola-mundo');
  });

  it('strips accents', () => {
    expect(slugify('Canción de Niño')).toBe('cancion-de-nino');
  });

  it('removes special chars', () => {
    expect(slugify('Suministros & Co.')).toBe('suministros-co');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('---hola---')).toBe('hola');
  });

  it('returns fallback for empty', () => {
    expect(slugify('')).toBe('sin-nombre');
    expect(slugify(null)).toBe('sin-nombre');
  });
});

describe('sha256Short', () => {
  it('takes first N chars', () => {
    expect(sha256Short('abc123def456', 6)).toBe('abc123');
  });
});
