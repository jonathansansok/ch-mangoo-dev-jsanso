import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { readXlsx } from './xlsx-text';

vi.mock('server-only', () => ({}));

function makeXlsxBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return out as Buffer;
}

describe('readXlsx', () => {
  it('parsea sheet con valores básicos', () => {
    const buf = makeXlsxBuffer([
      ['Proveedor', 'ACME'],
      ['supplier_code', 'description', 'quantity'],
      ['X-1', 'Lapicera', 100],
    ]);
    const sheets = readXlsx(buf);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.rows.length).toBeGreaterThanOrEqual(3);
    expect(sheets[0]?.rows[0]?.[0]).toBe('Proveedor');
  });

  it('limita a MAX_SHEETS hojas', () => {
    const wb = XLSX.utils.book_new();
    for (let i = 0; i < 5; i++) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), `Sheet${i + 1}`);
    }
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const sheets = readXlsx(buf);
    expect(sheets.length).toBe(3);
  });
});
