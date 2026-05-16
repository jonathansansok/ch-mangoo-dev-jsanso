# Spec 07 — Trazabilidad

## Objetivo

Hacer auditables todas las decisiones del workflow AI. Cualquiera que revise una oferta procesada debe poder responder: qué se llamó al LLM, qué prompt se mandó, qué devolvió, qué se decidió a partir de eso y cuánto costó. Es exigencia explícita del spec del challenge.

## Modelo

`DecisionLog` ya está definido en spec 01. Recordatorio de campos:

- `id`, `offerId?`, `reconciliationLineId?`, `kind`, `model`
- `promptTokens`, `completionTokens`, `costUsd`
- `prompt` (truncado a 10k chars)
- `rawResponse` (truncado a 10k chars)
- `candidatesConsidered` (JSON)
- `durationMs`, `createdAt`

`kind` enum: `EXTRACT_HEADER`, `EXTRACT_ITEMS`, `EMBED_REQUEST`, `EMBED_OFFER`, `JUDGE_BATCH`.

## Captura (responsabilidad del wrapper AI)

El wrapper `infra/ai/openai.ts` es la única vía de llamada al LLM. Toda función que llama a OpenAI pasa por él. Cada llamada produce un `DecisionLog` antes de retornar al caller.

```ts
async function callLLM(args: {
  kind: DecisionKind;
  offerId?: number;
  reconciliationLineId?: number;
  request: ChatRequest;
  candidatesConsidered?: unknown;
}): Promise<LLMResponse> {
  const start = Date.now();
  const res = await retryingClient.chat.completions.create(args.request);
  const usage = res.usage;
  const cost = estimateCost(args.request.model, usage);

  await prisma.decisionLog.create({
    data: {
      offerId: args.offerId,
      reconciliationLineId: args.reconciliationLineId,
      kind: args.kind,
      model: args.request.model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      costUsd: cost,
      prompt: truncate(serializeMessages(args.request.messages), 10_000),
      rawResponse: truncate(res.choices[0].message.content ?? '', 10_000),
      candidatesConsidered: args.candidatesConsidered ?? undefined,
      durationMs: Date.now() - start,
    },
  });

  return res;
}
```

Mismo patrón para embeddings (`callEmbed`).

`reconciliationLineId` se setea solo en `JUDGE_BATCH` cuando ya se conoce el ID. Como el batch crea N lines a la vez, el log se asocia primero al `offerId` y después un campo `candidatesConsidered.linkedLineIds` lleva el array de IDs creados. Decisión: para no crear N logs duplicados por batch, **un log por batch**, no por línea. La pantalla expande el log y muestra las líneas asociadas.

## Costo estimado

Tabla de precios versionada en `lib/openai-pricing.ts` (USD por 1M tokens). Fuente: pricing oficial de OpenAI, congelado al snapshot del proyecto.

```ts
const PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
} as const;

function estimateCost(
  model: string,
  usage: { prompt_tokens: number; completion_tokens: number },
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (usage.prompt_tokens * p.input + usage.completion_tokens * p.output) / 1_000_000;
}
```

Si OpenAI cambia precios, basta actualizar la tabla; los logs ya persistidos mantienen el costo histórico del momento.

## UI

### Tab "Trazabilidad" en `/ofertas/[id]`

Layout (sigue `ui-style.md`):

```
┌──────────────────────────────────────────────────────────┐
│  KPIs row (4 StatCards)                                  │
│  - Llamadas totales: 28                                  │
│  - Tokens prompt: 47.234                                 │
│  - Tokens completion: 18.901                             │
│  - Costo estimado: US$ 0,0220                            │
├──────────────────────────────────────────────────────────┤
│  Filtros: [kind ▾] [modelo ▾] [orden ▾]                  │
├──────────────────────────────────────────────────────────┤
│  Tabla de DecisionLog                                    │
│  # | hora | tipo | modelo | tokens | costo | duración    │
│  Cada fila clickeable → drawer con detalle               │
├──────────────────────────────────────────────────────────┤
│  Botones: [Exportar JSON] [Exportar CSV]                 │
└──────────────────────────────────────────────────────────┘
```

### Tabla list view

Columnas:

- `#`: índice (1, 2, 3...)
- `Hora`: `HH:mm:ss` en es-AR
- `Tipo`: label legible en español:
  - `EXTRACT_HEADER` → "Extracción header"
  - `EXTRACT_ITEMS` → "Extracción items"
  - `EMBED_REQUEST` → "Embeddings solicitud"
  - `EMBED_OFFER` → "Embeddings oferta"
  - `JUDGE_BATCH` → "Conciliación lote"
- `Modelo`: tal como viene (`gpt-4o-mini`, etc).
- `Tokens (in / out)`: `47.234 / 18.901` formato es-AR.
- `Costo`: `US$ 0,0220`.
- `Duración`: `1.342 ms` o `1,3 s` si > 1000ms.

Sin cargar `prompt` ni `rawResponse` en el list view (campos `text` pesados). Query con `select` explícito que los excluye.

### Drawer de detalle

Click en fila abre un Sheet/Drawer lateral con:

1. **Metadatos**: ID, kind, modelo, timestamps, tokens, costo, duración.
2. **Items afectados** (si `JUDGE_BATCH`): chips con los `ReconciliationLine` IDs vinculados. Click → navega a esa línea de la tabla de conciliación.
3. **Prompt enviado**: bloque `<pre>` con `prompt`. Botón "Copiar".
4. **Raw response**: bloque `<pre>` con `rawResponse`. Botón "Copiar".
5. **Candidatos considerados** (si aplica): tabla con `[{ requestItemId, similarity }]`.

Truncado a 10k chars con label "_(truncado, prompt original era más largo)_" si llegó al límite.

### Filtros

- `kind`: dropdown multi-select con los 5 valores.
- `modelo`: dropdown single con valores distintos presentes en los logs de la oferta actual.
- `orden`: dropdown con `Cronológico ↑`, `Cronológico ↓`, `Costo ↓`, `Duración ↓`.

Filtros aplican client-side sobre el resultado de query (no es paginado, el volumen por oferta es chico: ~25 logs en case-complex).

### Export

- **JSON**: server action devuelve `application/json` con el array completo de logs (incluyendo `prompt` y `rawResponse` completos sin truncar respecto a lo guardado).
- **CSV**: server action genera CSV con columnas: `id`, `kind`, `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `duration_ms`, `created_at`. Sin prompts/responses (CSV no sirve para texto largo).

Filename: `traceability-{offerId}-{timestamp}.{ext}`.

## Linking desde ReconciliationLine

En la tab "Conciliación" de `/ofertas/[id]`, cada fila de la tabla tiene un icono "ver decisión" que abre el mismo drawer de DecisionLog filtrado a esa línea. Útil para responder "¿por qué este match?" directamente.

Implementación: query `prisma.decisionLog.findMany({ where: { reconciliationLineId } })` (uno o más logs si hay reintentos del judge).

## Aggregate stats (KPI cards)

Query agregada por oferta:

```ts
const stats = await prisma.decisionLog.aggregate({
  where: { offerId },
  _count: { id: true },
  _sum: { promptTokens: true, completionTokens: true, costUsd: true, durationMs: true },
});
```

Mostrado en los 4 StatCards arriba de la tabla.

## Privacidad y seguridad

- `prompt` puede contener descripciones del proveedor, no datos sensibles del comprador. Aún así, persistir en DB significa que cualquiera con acceso a DB ve los prompts. Para este challenge es aceptable (demo single-tenant, sin PII real).
- En producción real (out of scope): cifrar `prompt` y `rawResponse` con AES-GCM al persistir. Documentar como mejora.
- `OPENAI_API_KEY` nunca se loguea ni aparece en `DecisionLog`.

## Performance

- Query list view: `SELECT id, kind, model, promptTokens, completionTokens, costUsd, durationMs, createdAt FROM DecisionLog WHERE offerId = ? ORDER BY createdAt ASC`. Index `(offerId)` ya está. Performance: ~25 rows × small columns = <10ms.
- Query detail: `findUnique` por ID, incluye `prompt` y `rawResponse`.
- Aggregate: una sola query con `_sum`.

Sin paginación. Por oferta, el volumen es bajo (case-complex ~25 logs).

A nivel global (todas las ofertas), si la tabla crece, agregar TTL: delete logs > 90 días. Out of scope ahora.

## Casos de borde

- **Oferta sin DecisionLog**: la oferta vino de cache (`ExtractionCache` hit) → no hay llamadas LLM. La tab muestra paragraph: "Esta oferta se procesó usando un resultado cacheado. No hubo llamadas al modelo en este flujo. Ver oferta original con `originalOfferId={id}` para detalle de la extracción inicial."
  - Decisión: `ExtractionCache` no apunta a la oferta que generó el payload. Para audit profundo necesitaríamos guardar `originalOfferId` en cache. **Lo agregamos a `ExtractionCache`** en una actualización del modelo. Spec 01 queda así, este cambio se introduce en una rama futura `feat/cache-traceability` antes de implementar.
- **Truncación de prompt al límite (10k chars)**: mostrar warning visible en el drawer.
- **`candidatesConsidered` null o vacío**: ocultar sección.
- **DecisionLog huérfano** (offer borrada con `SetNull`): visible solo en lista global de auditoría futura, no en `/ofertas/[id]` porque no hay offer.
- **Múltiples DecisionLog para mismo `reconciliationLineId`** (judge reintentó por schema roto): mostrar los N en orden cronológico. El último es el ganador.

## Tests

1. `callLLM` wrapper escribe DecisionLog con todos los campos completos.
2. `estimateCost` retorna 0 si modelo desconocido, valores correctos para los modelos en la tabla.
3. Query agregada devuelve sumas correctas con fixture de 3 logs.
4. Truncate de prompt > 10k chars deja 10k exactos.
5. Filename de export incluye offerId y timestamp.
6. Export JSON contiene `prompt` y `rawResponse` completos; CSV no.
7. Drawer trae todos los logs vinculados a una `reconciliationLineId` específica.
8. Oferta de cache (ExtractionCache hit) muestra UI vacía con mensaje.
9. Format de tokens y costo en es-AR.

## Criterios de aceptación

- En `/ofertas/[id]` tab Trazabilidad, KPIs reflejan suma exacta de `DecisionLog` de esa oferta.
- Tabla muestra ~25 logs para case-complex, ordenados cronológicamente por default.
- Click en fila abre drawer con prompt y raw completos.
- Click en icono "ver decisión" en tab Conciliación abre drawer filtrado.
- Export JSON y CSV funcionan, archivos descargan con nombre correcto.
- Performance: list view < 50ms, drawer < 100ms.

## Out of scope

- Vista global de DecisionLog cross-oferta (admin panel de auditoría). Mejora futura.
- TTL automático de logs viejos.
- Cifrado de prompt/raw.
- Búsqueda full-text en prompts.
- Comparación lado a lado de dos decisiones.

## Próximo

- `08-api-and-ui.md`: rutas Next, server actions, layout de páginas.
