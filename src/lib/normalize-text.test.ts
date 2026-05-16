import { describe, expect, it } from 'vitest';
import { embedText, normalizeText, normalizeUnit, unitsCompatible } from './normalize-text';

describe('normalizeText', () => {
  it('lowercases', () => {
    expect(normalizeText('HOLA Mundo')).toBe('hola mundo');
  });

  it('strips accents', () => {
    expect(normalizeText('canción')).toBe('cancion');
    expect(normalizeText('así')).toBe('asi');
  });

  it('collapses spaces and trims', () => {
    expect(normalizeText('   hola   mundo  ')).toBe('hola mundo');
  });
});

describe('normalizeUnit', () => {
  it('maps m to metro', () => {
    expect(normalizeUnit('m')).toBe('metro');
  });

  it('maps unidades to unidad', () => {
    expect(normalizeUnit('unidades')).toBe('unidad');
  });

  it('returns null for null/empty', () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit('')).toBeNull();
  });

  it('returns unknown units as-is normalized', () => {
    expect(normalizeUnit('Tonelada')).toBe('tonelada');
  });
});

describe('unitsCompatible', () => {
  it('matches synonyms', () => {
    expect(unitsCompatible('m', 'metro')).toBe(true);
    expect(unitsCompatible('unidades', 'u')).toBe(true);
  });

  it('rejects different units', () => {
    expect(unitsCompatible('metro', 'kilogramo')).toBe(false);
  });

  it('is permissive when one is null', () => {
    expect(unitsCompatible(null, 'metro')).toBe(true);
    expect(unitsCompatible('m', null)).toBe(true);
  });
});

describe('embedText', () => {
  it('combines description and unit', () => {
    expect(embedText('Cable rojo', 'metros')).toBe('cable rojo metro');
  });

  it('omits unit when null', () => {
    expect(embedText('Boligrafo', null)).toBe('boligrafo');
  });
});
