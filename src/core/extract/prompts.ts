export const EXTRACT_SYSTEM_PROMPT = [
  'Eres un asistente que extrae información estructurada de ofertas comerciales',
  'en español de proveedores argentinos. Devolvés JSON estricto según el schema.',
  'No inventás datos: si un campo no aparece en el texto, devolvés null.',
  'No traducís descripciones ni unidades: las dejás tal como el proveedor las escribe.',
  'Normalizá decimales con coma a punto (1,5 → 1.5). Moneda en ISO 4217 (ARS, USD).',
].join(' ');

const SCHEMA_HINT = `Schema esperado:
{
  "header": {
    "supplierName": string|null,
    "offerDate": string|null,  // ISO 8601 si parseable
    "observations": string|null
  },
  "items": [
    {
      "lineNumber": number,    // entero positivo, orden global
      "supplierCode": string|null,
      "description": string,   // no vacío
      "quantity": number|null, // no negativo
      "unitPrice": number|null,
      "currency": string|null, // ISO 4217 (3 chars)
      "unit": string|null,
      "rawObservations": string|null
    }
  ]
}`;

export function buildExtractUserPrompt(text: string): string {
  return [
    'Texto de la oferta:',
    '',
    '<<<',
    text,
    '>>>',
    '',
    'Tarea: extraer cabecera (proveedor, fecha, observaciones generales) e items',
    'ofertados. Cada item es una línea con descripción, cantidad, precio unitario,',
    'moneda, unidad y código de proveedor si aparece.',
    '',
    SCHEMA_HINT,
  ].join('\n');
}
