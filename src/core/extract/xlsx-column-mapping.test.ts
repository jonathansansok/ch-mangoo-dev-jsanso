import { describe, it, expect } from 'vitest';
import { detectColumnMap, detectHeaderRow, hasMinimumMapping } from './xlsx-column-mapping';

describe('detectColumnMap', () => {
  it('mapea headers en español', () => {
    const map = detectColumnMap(['Código', 'Descripción', 'Cantidad', 'Precio unitario', 'Unidad']);
    expect(map.supplierCode).toBe(0);
    expect(map.description).toBe(1);
    expect(map.quantity).toBe(2);
    expect(map.unitPrice).toBe(3);
    expect(map.unit).toBe(4);
  });

  it('mapea headers snake_case en inglés', () => {
    const map = detectColumnMap([
      'line_no',
      'supplier_code',
      'offered_description',
      'offered_quantity',
      'unit',
      'unit_price',
      'notes',
    ]);
    expect(map.lineNumber).toBe(0);
    expect(map.supplierCode).toBe(1);
    expect(map.description).toBe(2);
    expect(map.quantity).toBe(3);
    expect(map.unit).toBe(4);
    expect(map.unitPrice).toBe(5);
    expect(map.rawObservations).toBe(6);
  });

  it('ignora celdas no string', () => {
    const map = detectColumnMap([null, 42, 'Descripción', new Date(), 'Cantidad']);
    expect(map.description).toBe(2);
    expect(map.quantity).toBe(4);
  });
});

describe('hasMinimumMapping', () => {
  it('exige description + (qty o precio)', () => {
    expect(hasMinimumMapping({ description: 0, quantity: 1 })).toBe(true);
    expect(hasMinimumMapping({ description: 0, unitPrice: 1 })).toBe(true);
    expect(hasMinimumMapping({ description: 0 })).toBe(false);
    expect(hasMinimumMapping({ quantity: 0, unitPrice: 1 })).toBe(false);
  });
});

describe('detectHeaderRow', () => {
  it('encuentra el header tras filas de cabecera', () => {
    const rows = [
      ['Cotizacion COT-001'],
      ['Proveedor', 'ACME'],
      ['Fecha', '2026-05-20'],
      [null],
      ['supplier_code', 'offered_description', 'offered_quantity', 'unit_price'],
      ['X-1', 'Lapicera azul', 100, 5],
    ];
    const detection = detectHeaderRow(rows);
    expect(detection?.rowIndex).toBe(4);
    expect(detection?.columnMap.description).toBe(1);
  });

  it('devuelve null si no hay header detectable', () => {
    const rows = [['un texto suelto'], ['mas texto']];
    expect(detectHeaderRow(rows)).toBeNull();
  });
});
