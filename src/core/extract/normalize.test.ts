import { describe, it, expect } from 'vitest';
import { normalizeOffer } from './normalize';

describe('normalizeOffer', () => {
  it('trim descriptions y deja vacíos como null donde aplica', () => {
    const out = normalizeOffer({
      header: { supplierName: '  ACME  ', offerDate: '2026-01-15', observations: '   ' },
      items: [
        {
          lineNumber: 1,
          supplierCode: '  SIP-1  ',
          description: '  Boligrafo  ',
          quantity: 10,
          unitPrice: 100,
          currency: 'ars',
          unit: '  unidad  ',
          rawObservations: '',
        },
      ],
    });

    expect(out.header.supplierName).toBe('ACME');
    expect(out.header.observations).toBeNull();
    expect(out.items[0]!.description).toBe('Boligrafo');
    expect(out.items[0]!.supplierCode).toBe('SIP-1');
    expect(out.items[0]!.unit).toBe('unidad');
    expect(out.items[0]!.currency).toBe('ARS');
    expect(out.items[0]!.rawObservations).toBeNull();
  });

  it('preserva quantity 0 (no convierte a null)', () => {
    const out = normalizeOffer({
      header: { supplierName: null, offerDate: null, observations: null },
      items: [
        {
          lineNumber: 1,
          supplierCode: null,
          description: 'x',
          quantity: 0,
          unitPrice: 0,
          currency: null,
          unit: null,
          rawObservations: null,
        },
      ],
    });
    expect(out.items[0]!.quantity).toBe(0);
    expect(out.items[0]!.unitPrice).toBe(0);
  });
});
