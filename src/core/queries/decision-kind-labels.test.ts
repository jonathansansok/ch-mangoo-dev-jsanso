import { describe, expect, it } from 'vitest';
import { kindLabel, KIND_LABELS } from './decision-kind-labels';

describe('decision-kind-labels', () => {
  it('returns es-AR label for each kind', () => {
    expect(kindLabel('EXTRACT_HEADER')).toBe('Datos del proveedor');
    expect(kindLabel('EXTRACT_ITEMS')).toBe('Ítems de la oferta');
    expect(kindLabel('EMBED_REQUEST')).toBe('Preparación de la solicitud');
    expect(kindLabel('EMBED_OFFER')).toBe('Preparación de la oferta');
    expect(kindLabel('JUDGE_BATCH')).toBe('Conciliación de ítems');
  });

  it('covers all DecisionKind enum values', () => {
    expect(Object.keys(KIND_LABELS)).toHaveLength(5);
  });
});
