import { z } from 'zod';

export const XlsxColumnMappingResponse = z.object({
  lineNumber: z.number().int().nullable(),
  supplierCode: z.number().int().nullable(),
  description: z.number().int(),
  quantity: z.number().int().nullable(),
  unitPrice: z.number().int().nullable(),
  currency: z.number().int().nullable(),
  unit: z.number().int().nullable(),
  rawObservations: z.number().int().nullable(),
});

export type XlsxColumnMappingResponse = z.infer<typeof XlsxColumnMappingResponse>;

export const XLSX_MAPPING_SYSTEM_PROMPT = [
  'Eres un asistente que mapea columnas de tablas de ofertas comerciales en español.',
  'Recibís un sample de filas de un XLSX y devolvés JSON con el índice (0-based) de cada columna.',
  'Si una columna no existe, devolvés null. La columna `description` es obligatoria.',
].join(' ');

export function buildXlsxMappingPrompt(sample: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const truncated = sample.map((row) => row.slice(0, 15));
  return [
    'Sample de filas (primeras filas del sheet, header puede o no estar):',
    '',
    JSON.stringify(truncated, null, 2),
    '',
    'Devolvé JSON con esta forma:',
    '{',
    '  "lineNumber": number|null,',
    '  "supplierCode": number|null,',
    '  "description": number,',
    '  "quantity": number|null,',
    '  "unitPrice": number|null,',
    '  "currency": number|null,',
    '  "unit": number|null,',
    '  "rawObservations": number|null',
    '}',
  ].join('\n');
}

export const XlsxHeaderResponse = z.object({
  supplierName: z.string().nullable(),
  offerDate: z.string().nullable(),
  observations: z.string().nullable(),
});

export type XlsxHeaderResponse = z.infer<typeof XlsxHeaderResponse>;

export const XLSX_HEADER_SYSTEM_PROMPT = [
  'Eres un asistente que extrae cabecera de ofertas comerciales en español.',
  'Recibís celdas sueltas del encabezado de un XLSX (proveedor, fecha, condiciones, etc.) y',
  'devolvés JSON con supplierName, offerDate (ISO 8601 si es parseable) y observations.',
  'Si un campo no aparece, devolvés null.',
].join(' ');

export function buildXlsxHeaderPrompt(cells: ReadonlyArray<string>): string {
  return [
    'Celdas del encabezado:',
    '',
    cells.map((c, i) => `${i + 1}. ${c}`).join('\n'),
    '',
    'Devolvé JSON: { "supplierName": string|null, "offerDate": string|null, "observations": string|null }',
  ].join('\n');
}
