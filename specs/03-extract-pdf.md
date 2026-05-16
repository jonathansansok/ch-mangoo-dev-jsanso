# Spec 03 — Extracción de oferta desde PDF

## Objetivo

Tomar un PDF subido por el usuario y devolver una representación estructurada de la oferta (header + items) validada con Zod, lista para persistir como `Offer` + `OfferItem[]`.

## Inputs

- `Buffer` del archivo PDF subido vía UI (server action o route handler).
- `offerId` ya creado en estado `EXTRACTING`.
- `requestId` asociado, por si el modelo necesita pistas de dominio (no se le pasa el contenido de la solicitud, solo metadatos del request si fuera necesario).

## Outputs

```ts
type ExtractedOffer = {
  header: {
    supplierName: string | null;
    offerDate: string | null; // ISO 8601 si parseable, null si no
    observations: string | null;
  };
  items: Array<{
    lineNumber: number;
    supplierCode: string | null;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    currency: string | null; // ISO 4217 o null
    unit: string | null;
    rawObservations: string | null;
  }>;
  meta: {
    strategy: 'text' | 'multimodal';
    model: string;
    fromCache: boolean;
  };
};
```

El servicio que consume este output se encarga de persistir en DB y disparar la conciliación.

## Estrategia de extracción

Dos caminos. Se elige uno en runtime según calidad del texto extraído.

### Camino A (default): texto plano

1. `pdf-parse` extrae texto del PDF.
2. Si `text.length >= MIN_TEXT_THRESHOLD` (200 chars), se asume PDF text-based.
3. Una sola llamada a `gpt-4o-mini` con `response_format: { type: "json_schema" }`. El modelo recibe el texto completo + schema y devuelve `{ header, items }` validado.

### Camino B (fallback): PDF nativo al modelo

1. Si `text.length < MIN_TEXT_THRESHOLD` o `pdf-parse` falla → el PDF es escaneado o tiene layout complejo.
2. Subir el PDF como input multimodal a `gpt-4o` (no mini, el mini no soporta PDF nativo según docs vigentes).
3. Mismo schema de salida.

Decisión de camino se loguea en `DecisionLog.candidatesConsidered` con `{ strategy, textLength, reason }`.

## Cache

Antes de cualquier llamada:

1. `fileHash = sha256(buffer)`.
2. `prisma.extractionCache.findUnique({ where: { fileHash } })`.
3. Si hit, devolver `payload` con `meta.fromCache = true`. Cero llamadas al LLM.
4. Si miss, ejecutar extracción, validar, guardar en cache.

Cache hit es la regla 8 del workflow AI (CLAUDE.md). Re-subir el mismo PDF no consume tokens.

## Prompt (camino A)

System:

```
Eres un asistente que extrae información estructurada de ofertas comerciales
en español de proveedores argentinos. Devolvés JSON estricto según el schema.
No inventás datos: si un campo no aparece en el texto, devolvés null.
No traducís descripciones ni unidades: las dejás tal como el proveedor las escribe.
```

User:

```
Texto de la oferta:

<<<
{texto extraído del PDF}
>>>

Tarea: extraer cabecera (proveedor, fecha, observaciones generales) e items
ofertados. Cada item es una línea con descripción, cantidad, precio unitario,
moneda, unidad y código de proveedor si aparece.
```

Sin few-shot. Sin chain-of-thought explícito (response_format estructurado ya fuerza la salida). Sin pedirle al modelo que "explique" o "razone" por afuera.

## Schema Zod

```ts
const Header = z.object({
  supplierName: z.string().nullable(),
  offerDate: z.string().nullable(), // valida ISO en post
  observations: z.string().nullable(),
});

const Item = z.object({
  lineNumber: z.number().int().positive(),
  supplierCode: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().nonnegative().nullable(),
  unitPrice: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  unit: z.string().nullable(),
  rawObservations: z.string().nullable(),
});

const ExtractedOffer = z.object({
  header: Header,
  items: z.array(Item).min(1),
});
```

Si la validación falla, reintento. Hasta 2 reintentos con feedback del error de Zod inyectado en el prompt:

```
La salida anterior rompió el schema. Error: {zod_error}. Devolvé JSON válido.
```

Después de 2 reintentos fallidos → `Offer.status = FAILED` con `failureReason = "schema_validation_failed"`. Persistir el último raw response en `DecisionLog` para revisión humana.

## Volumen y división de respuesta

Para PDFs largos como `case-complex` (220 items), el texto del PDF puede llegar a ~30-50k tokens. El output JSON con 220 items puede llegar a ~15k tokens.

Estrategia:

- Si `tokenCount(text) > 40_000`: dividir el texto en chunks por página o por bloques de líneas, hacer una llamada por chunk para extraer items, mergear arrays.
- El header se extrae una sola vez con el primer chunk.
- Cada chunk va a `DecisionLog` separado.
- `lineNumber` se renumera al mergear para mantener orden global.

Para `case-simple` el texto cae bajo el umbral, una llamada alcanza.

## Manejo de tokens y costo

Wrapper `openai.ts`:

```ts
async function callChat(params: ChatParams): Promise<ChatResult> {
  const start = Date.now();
  const res = await openai.chat.completions.create(params);
  const usage = res.usage;
  const cost = estimateCost(params.model, usage);
  await prisma.decisionLog.create({
    data: {
      kind: 'EXTRACT_HEADER' /* o el que corresponda */,
      model: params.model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      costUsd: cost,
      prompt: truncate(JSON.stringify(params.messages), 10_000),
      rawResponse: truncate(res.choices[0].message.content ?? '', 10_000),
      durationMs: Date.now() - start,
      offerId,
    },
  });
  return { content: res.choices[0].message.content, usage, cost };
}
```

Costos `gpt-4o-mini` actuales (USD por 1M tokens, sujeto a cambio):

- Input: $0.150
- Output: $0.600

Para case-complex (estimado): ~50k input + ~15k output ≈ $0.0165 por extracción. Aceptable.

## Reintentos y errores transitorios

`p-retry` con backoff exponencial:

- Rate limit (429): hasta 3 reintentos, base 1s, max 8s.
- 5xx de OpenAI: hasta 3 reintentos.
- Network errors: hasta 3 reintentos.
- Errores de validación Zod: hasta 2 reintentos con feedback (distintos a los transitorios).

Si todo falla, `Offer.status = FAILED` con `failureReason` específico.

## Normalización post-extracción

Mínima en esta etapa. Solo:

- `currency` a uppercase.
- `unit` trim.
- `description` trim.
- Si `quantity == 0` se mantiene 0 (no se trata como null). El semantic significa "el proveedor cotizó pero la cantidad es 0".

Normalización profunda (unidades equivalentes, sinónimos) ocurre en la spec 05 de conciliación.

## Casos de borde

- **PDF encriptado o con password**: `pdf-parse` tira error, capturar, marcar Offer como FAILED con `failureReason = "encrypted"`.
- **PDF sin texto extraíble (scan puro)**: caer al camino B. Si el camino B tampoco devuelve items, FAILED.
- **PDF con header en hoja 1 e items en hoja 2+**: el texto unido ya incluye todo, el prompt cubre.
- **Múltiples proveedores en mismo PDF**: caso raro. Se toma el primero detectado, se loguea warning. No se intenta dividir.
- **Tabla con celdas mergeadas**: `pdf-parse` puede romper la estructura. Si el modelo no logra extraer items coherentes (Zod falla 2 veces), caer a camino B.
- **Items con líneas vacías o separadores en el texto**: el modelo los ignora si están bien instruidos.
- **Moneda no explicitada**: `currency = null`. La UI lo muestra como "moneda no declarada".
- **Decimal con coma**: instruir al modelo a normalizar `1,5` → `1.5` en la salida JSON.
- **Cantidad con texto adjunto ("100 unidades")**: el modelo extrae `quantity: 100, unit: "unidades"`. Si no, se guarda con qty null y se ve en `rawObservations`.
- **Texto del PDF con caracteres mal codificados**: si la fracción de chars no-ASCII no-imprimibles excede 20%, marcar como sospechoso y caer a camino B.

## Performance

- case-simple: < 5s end-to-end (text + 1 call + persist).
- case-complex: < 30s end-to-end. Si excede, dividir en chunks y procesar paralelo con `Promise.all` (límite 5 concurrent para no pegar rate limits).

## Tests

1. **Cache hit**: subir el mismo PDF dos veces, segunda llamada no toca OpenAI (mock spy).
2. **Camino A**: PDF de prueba text-based, devuelve schema válido.
3. **Camino B**: PDF mock con texto vacío → cae a multimodal (mock OpenAI multimodal).
4. **Schema retry**: primer mock devuelve JSON inválido, segundo válido, asserts.
5. **Schema fail definitivo**: 3 mocks inválidos, Offer queda FAILED.
6. **PDF encriptado**: pdf-parse mock tira error → Offer FAILED con razón.
7. **Token logging**: tras una llamada, existe un DecisionLog con `kind: EXTRACT_ITEMS` y costo > 0.
8. **case-simple real fixture**: corre extracción contra `oferta_comercial_oficinas.pdf` con OpenAI key real (test marcado como `integration`, solo corre en CI con key).
9. **case-complex real fixture**: corre contra `oferta_mantenimiento_integral.pdf`, asegura ≥ 200 items extraídos.

Mocks de OpenAI con `vi.mock('openai')` o fixture HTTP con `msw`. Los tests `integration` se saltan en local si no hay `OPENAI_API_KEY`.

## Criterios de aceptación

- Subir `case-simple/oferta_comercial_oficinas.pdf` produce `Offer` en estado `EXTRACTED` con ≥ 5 items.
- Subir `case-complex/oferta_mantenimiento_integral.pdf` produce ≥ 200 items en < 30s.
- Re-subir mismo archivo no genera nueva llamada al LLM (verificable contando `DecisionLog` antes/después).
- Tests pasan en CI.
- `prisma.decisionLog` queda poblado por cada llamada con costo > 0.

## Out of scope

- OCR para PDFs escaneados con calidad baja. El camino B usa el OCR interno de `gpt-4o`, no se monta Tesseract.
- Extraer firmas, sellos, imágenes de catálogo.
- Soportar contraseñas de PDF.
- Procesar PDFs multi-oferta (varias ofertas en un archivo).

## Próximo

- `04-extract-xlsx.md`: pipeline equivalente para XLSX (sheetjs + LLM o solo sheetjs si la estructura es clara).
