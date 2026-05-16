export type XlsxColumnKey =
  | 'lineNumber'
  | 'supplierCode'
  | 'description'
  | 'quantity'
  | 'unitPrice'
  | 'currency'
  | 'unit'
  | 'rawObservations';

export type XlsxColumnMap = Partial<Record<XlsxColumnKey, number>>;

const PATTERNS: Record<XlsxColumnKey, RegExp> = {
  lineNumber: /^(line[_\s-]?no\b|l[ií]nea\b|nro\b|n[°ºo]\.?\b|item[_\s-]?no\b|#)/i,
  supplierCode:
    /^(c[óo]digo\b|sku\b|ref(?:erencia)?\b|cod\.?\b|art[íi]culo\b|supplier[_\s-]?code\b|product[_\s-]?code\b)/i,
  description:
    /^(descripci[óo]n\b|producto\b|art[íi]culo\b|detalle\b|item(?:[_\s-]?name)?\b|offered[_\s-]?description\b|description\b)/i,
  quantity: /^(cantidad\b|qty\b|unidades?\b|cant\.?\b|offered[_\s-]?quantity\b|quantity\b)/i,
  unitPrice:
    /^(precio[_\s-]?unit|valor[_\s-]?unit|p\.?u\.?\b|costo[_\s-]?unit|unit[_\s-]?price\b|price\b|precio\b|valor\b)/i,
  currency: /^(moneda\b|currency\b|divisa\b)/i,
  unit: /^(unidad(?:[_\s-]?(?:de\s+)?medida)?\b|um\b|u\.?m\.?\b|unit(?:[_\s-]?of[_\s-]?measure)?\b)/i,
  rawObservations: /^(notes?\b|observaciones?\b|obs\b|comentarios?\b|notas?\b)/i,
};

export interface HeaderDetection {
  rowIndex: number;
  columnMap: XlsxColumnMap;
}

export function detectColumnMap(headerRow: ReadonlyArray<unknown>): XlsxColumnMap {
  const map: XlsxColumnMap = {};
  for (const [key, pattern] of Object.entries(PATTERNS) as Array<[XlsxColumnKey, RegExp]>) {
    for (let col = 0; col < headerRow.length; col++) {
      if (map[key] !== undefined) break;
      const cell = headerRow[col];
      if (typeof cell !== 'string') continue;
      if (pattern.test(cell.trim())) map[key] = col;
    }
  }
  return map;
}

export function hasMinimumMapping(map: XlsxColumnMap): boolean {
  if (map.description === undefined) return false;
  return map.quantity !== undefined || map.unitPrice !== undefined;
}

export function detectHeaderRow(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  maxScan = 30,
): HeaderDetection | null {
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row) continue;
    const map = detectColumnMap(row);
    const hits = Object.keys(map).length;
    if (hits >= 3 && hasMinimumMapping(map)) {
      return { rowIndex: i, columnMap: map };
    }
  }
  return null;
}
