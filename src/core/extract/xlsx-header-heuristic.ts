import type { ExtractedHeader } from './schema';

const SUPPLIER_LABEL = /^(proveedor|supplier|raz[óo]n\s*social|empresa)$/i;
const DATE_LABEL = /^(fecha|date|emisi[óo]n)$/i;
const OBS_LABEL = /^(condiciones|observaciones|notas|comentarios|terms|conditions)$/i;

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return null;
}

function findValueAfterLabel(row: ReadonlyArray<unknown>, labelCol: number): string | null {
  for (let c = labelCol + 1; c < row.length; c++) {
    const v = asText(row[c]);
    if (v !== null) return v;
  }
  return null;
}

export function extractHeaderHeuristic(
  preTableRows: ReadonlyArray<ReadonlyArray<unknown>>,
): ExtractedHeader {
  let supplierName: string | null = null;
  let offerDate: string | null = null;
  let observations: string | null = null;

  for (const row of preTableRows) {
    for (let c = 0; c < row.length; c++) {
      const cell = asText(row[c]);
      if (!cell) continue;

      if (!supplierName && SUPPLIER_LABEL.test(cell)) {
        supplierName = findValueAfterLabel(row, c);
      } else if (!offerDate && DATE_LABEL.test(cell)) {
        offerDate = findValueAfterLabel(row, c);
      } else if (!observations && OBS_LABEL.test(cell)) {
        observations = findValueAfterLabel(row, c);
      }
    }
  }

  return { supplierName, offerDate, observations };
}

export function inferSupplierFromFilename(fileName: string): string | null {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const match = stem.match(/^oferta[_\s-]+([a-zá-úñ0-9_\s-]+)/i);
  if (!match || !match[1]) return null;
  return match[1].replace(/[_-]+/g, ' ').trim() || null;
}
