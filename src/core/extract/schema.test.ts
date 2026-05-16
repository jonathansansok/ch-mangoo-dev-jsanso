import { describe, it, expect } from 'vitest';
import { ExtractedOffer } from './schema';

describe('ExtractedOffer schema', () => {
  const validHeader = { supplierName: 'ACME', offerDate: '2026-01-15', observations: null };
  const validItem = {
    lineNumber: 1,
    supplierCode: 'SIP-001',
    description: 'Boligrafo azul',
    quantity: 10,
    unitPrice: 250.5,
    currency: 'ARS',
    unit: 'unidad',
    rawObservations: null,
  };

  it('acepta una oferta válida', () => {
    const result = ExtractedOffer.safeParse({ header: validHeader, items: [validItem] });
    expect(result.success).toBe(true);
  });

  it('rechaza items vacíos', () => {
    const result = ExtractedOffer.safeParse({ header: validHeader, items: [] });
    expect(result.success).toBe(false);
  });

  it('rechaza description vacía', () => {
    const result = ExtractedOffer.safeParse({
      header: validHeader,
      items: [{ ...validItem, description: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza quantity negativa', () => {
    const result = ExtractedOffer.safeParse({
      header: validHeader,
      items: [{ ...validItem, quantity: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza currency de longitud distinta a 3', () => {
    const result = ExtractedOffer.safeParse({
      header: validHeader,
      items: [{ ...validItem, currency: 'pesos' }],
    });
    expect(result.success).toBe(false);
  });

  it('acepta nullables en campos opcionales', () => {
    const result = ExtractedOffer.safeParse({
      header: { supplierName: null, offerDate: null, observations: null },
      items: [
        {
          lineNumber: 1,
          supplierCode: null,
          description: 'X',
          quantity: null,
          unitPrice: null,
          currency: null,
          unit: null,
          rawObservations: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
