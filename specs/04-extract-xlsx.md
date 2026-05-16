# Spec 04 — Extracción de oferta desde XLSX

## Objetivo

Procesar un XLSX subido por el usuario y devolver el mismo `ExtractedOffer` que la spec 03, pero aprovechando que un Excel ya viene estructurado: la mayoría de las veces no hace falta LLM para los items, solo para mapear columnas si la cabecera es ambigua y para parsear el header (proveedor, fecha, observaciones) que suele venir en celdas sueltas arriba de la tabla.

## Inputs

- `Buffer` del XLSX subido.
- `offerId` en estado `EXTRACTING`.

## Outputs

Mismo shape que spec 03:

```ts
type ExtractedOffer = {
  header: { supplierName; offerDate; observations };
  items: Array<{
    lineNumber;
    supplierCode;
    description;
    quantity;
    unitPrice;
    currency;
    unit;
    rawObservations;
  }>;
  meta: { strategy: 'direct' | 'llm-assisted'; model: string | null; fromCache: boolean };
};
```

`model` es null si no hubo llamada al LLM (camino directo puro). Eso debe reflejarse en `DecisionLog`: solo se loguean las llamadas que efectivamente ocurrieron.

## Estrategia (dos caminos)

### Camino A (preferido): direct mapping

1. Leer XLSX con `xlsx` (sheetjs): `XLSX.read(buffer, { type: 'buffer', cellDates: true })`.
2. Tomar la primera sheet por default (configurable).
3. Convertir a array de arrays: `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null })`.
4. Detectar la fila de header de la tabla de items: la primera fila donde ≥3 celdas matchean patrones conocidos (`código|sku`, `descripción|producto|item`, `cantidad|qty|unidades`, `precio|valor|costo`, `unidad|um`, `moneda`).
5. Mapear columnas con tabla de regex (en `infra/extractors/xlsx-column-mapping.ts`):
   ```
   supplierCode:  /^(c[óo]digo|sku|ref|cod\.?|art[íi]culo)/i
   description:   /^(descripci[óo]n|producto|art[íi]culo|detalle|item)/i
   quantity:      /^(cantidad|qty|unidades?|cant\.?)/i
   unitPrice:     /^(precio.*unit|valor.*unit|p\.?u\.?|costo.*unit)/i
   currency:      /^(moneda|currency)/i
   unit:          /^(unidad.*medida|um|u\.?m\.?)/i
   ```
6. Si el mapping cubre **al menos** `description` + (`quantity` o `unitPrice`), se considera confianza alta → iterar filas debajo del header y emitir items directamente.
7. Filas vacías o con `description` null → skip.
8. Filas de totales/subtotales (matchean `total|subtotal|iva|impuesto` en primera celda con texto) → skip y guardar en `header.observations` como totales si traen valor.

### Camino B (fallback): LLM-assisted column mapping

Si el camino A no logra mapear las columnas mínimas o detecta ≥2 columnas con headers ambiguos:

1. Tomar las primeras 5-10 filas del sheet como sample.
2. Llamada a `gpt-4o-mini` con `response_format: json_schema` pidiendo el mapping `{ supplierCode: colIndex|null, description: colIndex, ... }`.
3. Con el mapping del LLM, iterar el resto de las filas directamente, sin más llamadas al LLM por item.

Esto sigue la regla 6 de CLAUDE.md: grounding por embeddings/heurística, LLM solo donde aporta valor.

## Extracción del header

El header (proveedor, fecha, observaciones) en XLSX suele estar en celdas sueltas arriba de la tabla de items: nombre del proveedor en B2, fecha en E2, etc. No tiene estructura predecible.

Estrategia:

1. Tomar todas las celdas no-null de las filas anteriores al header de la tabla detectado en el camino A.
2. Si hay ≤30 celdas con texto, mandar todo concatenado a `gpt-4o-mini` con schema:
   ```
   { supplierName, offerDate, observations }
   ```
3. Una sola llamada. Loguear en `DecisionLog` como `EXTRACT_HEADER`.

Si el sheet no tiene contenido antes del header (raro pero posible), `supplierName = null`, `observations = null`. Se infiere desde el nombre del archivo si el usuario lo subió con un nombre tipo `oferta_acme_2026.xlsx`: extraer `acme` como fallback. Esto se loguea como heurística, no se promete certeza.

## Cache

Igual que spec 03:

1. `fileHash = sha256(buffer)`.
2. Cache hit → devolver payload con `meta.fromCache = true`. No se llama al LLM ni se re-parsea el XLSX.
3. Cache miss → procesar y guardar.

## Schema Zod

Mismos schemas que spec 03 (`Header`, `Item`, `ExtractedOffer`). Reutilizar desde `core/domain/extracted-offer.ts`, no duplicar.

## Manejo de tipos crudos de XLSX

Sheetjs devuelve valores con tipos diversos. Normalizar antes de validar Zod:

- **Números**: vienen como `number` nativo. OK.
- **Fechas**: con `cellDates: true`, vienen como `Date`. Convertir a ISO string en el header.
- **Texto con espacios**: trim.
- **Celdas con fórmula**: sheetjs evalúa por default y devuelve el valor cacheado. Si no hay valor cacheado, marcar como null y loguear warning.
- **Celdas merged**: sheetjs devuelve el valor solo en la esquina superior-izquierda; las otras celdas del merge devuelven null. Para el header puede importar, para items rara vez.
- **Currency strings (`$1.50`, `ARS 1,50`)**: parser propio en `lib/parse-money.ts`:
  ```ts
  parseMoney("$ 1.234,56") → { amount: 1234.56, currency: 'ARS' }
  parseMoney("USD 99.95")  → { amount: 99.95, currency: 'USD' }
  parseMoney("1500")       → { amount: 1500, currency: null }
  ```
  Soporta separador decimal coma o punto. Detección de moneda por prefijo/sufijo conocido.
- **Decimal con coma**: `parseMoney` lo maneja. Para cantidades sueltas (no monedas), helper `parseDecimal("1.234,56")` similar.

## Múltiples sheets

Por default solo se procesa la primera sheet. Si el XLSX tiene varias y la primera es "Resumen" o "Carátula", la heurística del header de tabla puede fallar.

Política: si la sheet activa no produce ≥1 item en el camino A ni B, probar con la siguiente sheet. Máximo 3 sheets exploradas. Loguear cuál se eligió.

## Casos de borde

- **XLSX con macros (`.xlsm`)**: aceptar, ignorar macros, procesar como xlsx común.
- **`.xls` (formato viejo binario)**: sheetjs lo soporta, no rechazar. Documentar en README que el formato preferido es `.xlsx`.
- **Sheet sin tabla, solo texto narrativo**: camino A no detecta header → camino B con todo el contenido como sample → si el LLM no encuentra estructura, FAILED con `failureReason = "no_structured_data"`.
- **Tabla con header en fila 1 directo**: camino A funciona, header de oferta queda null, se infiere por filename si aplica.
- **Header de tabla en idioma mixto (ESN/ENG)**: las regex de mapping son case-insensitive y cubren ambos idiomas comunes (`description|descripción|producto`).
- **Columna de cantidad con celdas mezcladas (números y texto "según pedido")**: si `quantity` no parsea a número, `quantity = null` y guardar el texto en `rawObservations`.
- **Filas con fórmulas que evalúan a `#N/A` o `#REF!`**: tratar como null, loguear warning.
- **XLSX corrupto**: sheetjs tira excepción, capturar, Offer FAILED con `failureReason = "corrupt_xlsx"`.
- **XLSX protegido con password**: no se soporta. Detectar y fallar con `failureReason = "password_protected"`.
- **Items duplicados (mismo supplierCode)**: consolidar sumando qty, loguear consolidación.
- **Tabla muy ancha (>20 columnas)**: el camino B trunca el sample a 15 columnas para no inflar el prompt.

## Decisiones de diseño

- **No usar OpenAI para items**: el camino A cubre el 95% de XLSX bien estructurados. El LLM se reserva para column mapping ambiguo + header. Esto baja costos a casi cero en el caso esperado.
- **No batchear**: a diferencia del PDF largo, el parsing de un XLSX con 220 filas es instantáneo en memoria. No hace falta dividir.
- **No reusar el path del PDF**: pdf y xlsx son tan distintos que compartir el flujo añade indirección sin ganar nada. Cada uno con su archivo bajo `infra/extractors/`.

## Performance

- case-simple xlsx: < 1s end-to-end.
- case-complex xlsx (220 filas): < 3s end-to-end si el camino A aplica. Si cae a camino B, +2s por la llamada de mapping.

## Tests

1. **Cache hit**: subir mismo XLSX dos veces, segunda no llama al LLM ni re-parsea.
2. **Camino A puro**: fixture con headers limpios (`Código`, `Descripción`, `Cantidad`, `Precio Unitario`, `Moneda`). Asserts: 0 llamadas al LLM, items extraídos correctos.
3. **Camino A + header LLM**: fixture con tabla limpia + celdas de header arriba. 1 llamada al LLM (extract header), 0 para items.
4. **Camino B**: fixture con headers raros (`Item`, `Detalle producto`, `Unid.`, `$/u`). 1 llamada al LLM para column mapping + 1 para header.
5. **Currency parsing**: tests unitarios para `parseMoney` cubriendo ARS/USD/sin moneda, separadores `,` y `.`.
6. **Decimal con coma en qty**: fila con `1.234,56` parsea a `1234.56`.
7. **Múltiples sheets**: primera sheet vacía, segunda con tabla válida → procesa segunda.
8. **XLSX corrupto**: buffer inválido → Offer FAILED con razón.
9. **`.xls` viejo**: fixture binaria, sheetjs lo lee, items extraídos.
10. **case-simple real fixture**: `oferta_oficenter_norte.xlsx` produce ≥ 6 items.
11. **case-complex real fixture**: `oferta_suministros_industriales.xlsx` produce ≥ 200 items.

Tests con OpenAI real se marcan `integration`. Resto con mocks de `xlsx` no es necesario (es lib determinista, sus tests propios cubren bien).

## Trazabilidad

`DecisionLog` se popula solo cuando hay llamada al LLM:

- `EXTRACT_HEADER`: una entrada con el prompt enviado y la respuesta.
- `EXTRACT_ITEMS` con `kind` extendido o usando un nuevo enum `MAP_COLUMNS` (si el camino B mapea columnas, registrar como `MAP_COLUMNS` para distinguirlo de extracción full).

Decisión: agregar `MAP_COLUMNS` al enum `DecisionKind` en spec 01 (actualización en migración futura). Por ahora la spec 01 queda fija y este caso se loguea como `EXTRACT_ITEMS` con `meta.subKind = 'map_columns'` en `candidatesConsidered`. Se prioriza no churn de schema.

## Criterios de aceptación

- Subir `case-simple/oferta_oficenter_norte.xlsx` produce `Offer` en `EXTRACTED` con ≥ 6 items en < 2s.
- Subir `case-complex/oferta_suministros_industriales.xlsx` produce ≥ 200 items en < 5s.
- Re-subir mismo archivo no genera llamadas adicionales al LLM.
- Camino A se ejerce sin llamadas al LLM en fixtures con headers limpios.
- Tests pasan en CI.

## Out of scope

- Conversión `.xls` → `.xlsx` server-side. Sheetjs ya lee `.xls`.
- Detección de imágenes embebidas (logos, sellos).
- Procesamiento de PivotTables.
- Soporte de CSV en este flujo (los CSVs son solo seed de fixtures).
- Validación cruzada multi-sheet (oferta dividida entre sheets).

## Próximo

- `05-reconcile.md`: el algoritmo de conciliación. Toma `Offer` + `OfferItem[]` ya persistidos y produce `Reconciliation` + `ReconciliationLine[]` con embeddings shortlist + LLM judge.
