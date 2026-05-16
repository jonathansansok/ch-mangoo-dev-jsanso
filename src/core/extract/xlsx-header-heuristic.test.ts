import { describe, it, expect } from 'vitest';
import { extractHeaderHeuristic, inferSupplierFromFilename } from './xlsx-header-heuristic';

describe('extractHeaderHeuristic', () => {
  it('extrae supplier/fecha/condiciones desde celdas label-value', () => {
    const rows = [
      ['Cotizacion COT-001'],
      ['Proveedor', 'ACME SA'],
      ['Fecha', '2026-05-20'],
      ['Condiciones', 'Entrega 7 dias habiles'],
    ];
    const header = extractHeaderHeuristic(rows);
    expect(header.supplierName).toBe('ACME SA');
    expect(header.offerDate).toBe('2026-05-20');
    expect(header.observations).toBe('Entrega 7 dias habiles');
  });

  it('convierte Date a ISO date', () => {
    const rows = [['Fecha', new Date('2026-05-20T00:00:00Z')]];
    const header = extractHeaderHeuristic(rows);
    expect(header.offerDate).toBe('2026-05-20');
  });

  it('devuelve null si no encuentra labels', () => {
    const header = extractHeaderHeuristic([['solo texto'], ['mas']]);
    expect(header.supplierName).toBeNull();
    expect(header.offerDate).toBeNull();
    expect(header.observations).toBeNull();
  });
});

describe('inferSupplierFromFilename', () => {
  it('extrae nombre desde oferta_<name>.xlsx', () => {
    expect(inferSupplierFromFilename('oferta_oficenter_norte.xlsx')).toBe('oficenter norte');
  });

  it('soporta guiones', () => {
    expect(inferSupplierFromFilename('oferta-acme-2026.pdf')).toBe('acme 2026');
  });

  it('devuelve null si no matchea', () => {
    expect(inferSupplierFromFilename('random.xlsx')).toBeNull();
  });
});
