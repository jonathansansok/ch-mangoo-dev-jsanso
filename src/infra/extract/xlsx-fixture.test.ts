import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readXlsx } from './xlsx-text';
import { detectColumnMap, detectHeaderRow } from '@/core/extract/xlsx-column-mapping';
import { extractHeaderHeuristic } from '@/core/extract/xlsx-header-heuristic';

vi.mock('server-only', () => ({}));

describe('XLSX fixtures (parsing puro, sin LLM)', () => {
  it('case-simple: detecta header de tabla y heurística de cabecera', async () => {
    const buf = await readFile(
      resolve(process.cwd(), 'fixtures/scenarios/case-simple/offers/oferta_oficenter_norte.xlsx'),
    );
    const sheets = readXlsx(buf);
    const sheet = sheets[0];
    expect(sheet).toBeDefined();

    const detection = detectHeaderRow(sheet!.rows);
    expect(detection).not.toBeNull();
    expect(detection!.columnMap.description).toBeDefined();
    expect(detection!.columnMap.quantity).toBeDefined();
    expect(detection!.columnMap.unitPrice).toBeDefined();

    const preTable = sheet!.rows.slice(0, detection!.rowIndex);
    const header = extractHeaderHeuristic(preTable);
    expect(header.supplierName).toBe('Oficenter Norte SA');
    expect(header.offerDate).toBe('2026-05-20');
    expect(header.observations).toContain('Entrega');

    const itemRows = sheet!.rows.slice(detection!.rowIndex + 1);
    const itemsWithDescription = itemRows.filter((r) => {
      const desc = r[detection!.columnMap.description!];
      return typeof desc === 'string' && desc.trim().length > 0;
    });
    expect(itemsWithDescription.length).toBeGreaterThanOrEqual(7);
  });

  it('case-complex: detecta tabla con ≥220 filas de items', async () => {
    const buf = await readFile(
      resolve(
        process.cwd(),
        'fixtures/scenarios/case-complex/offers/oferta_suministros_industriales.xlsx',
      ),
    );
    const sheets = readXlsx(buf);
    const sheet = sheets[0];
    const detection = detectHeaderRow(sheet!.rows);
    expect(detection).not.toBeNull();

    const itemRows = sheet!.rows.slice(detection!.rowIndex + 1);
    const itemsWithDescription = itemRows.filter((r) => {
      const desc = r[detection!.columnMap.description!];
      return typeof desc === 'string' && desc.trim().length > 0;
    });
    expect(itemsWithDescription.length).toBeGreaterThanOrEqual(200);
  });

  it('confirma headers snake_case se mapean en los fixtures', async () => {
    const buf = await readFile(
      resolve(process.cwd(), 'fixtures/scenarios/case-simple/offers/oferta_oficenter_norte.xlsx'),
    );
    const sheets = readXlsx(buf);
    const detection = detectHeaderRow(sheets[0]!.rows);
    const headerRow = sheets[0]!.rows[detection!.rowIndex];
    const map = detectColumnMap(headerRow!);
    expect(map.lineNumber).toBe(0);
    expect(map.supplierCode).toBe(1);
    expect(map.description).toBe(2);
    expect(map.quantity).toBe(3);
    expect(map.unit).toBe(4);
    expect(map.unitPrice).toBe(5);
    expect(map.rawObservations).toBe(6);
  });
});
