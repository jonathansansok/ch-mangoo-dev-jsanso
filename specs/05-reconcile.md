# Spec 05 — Algoritmo de conciliación

## Objetivo

Tomar una `Offer` en estado `EXTRACTED` y producir una `Reconciliation` con `ReconciliationLine[]` que indique, para cada item ofertado, su relación con los items de la solicitud asociada. Cumplir las 10 reglas duras del workflow AI (CLAUDE.md sección "Reglas duras"): outputs referenciales cortos, batches autocontenidos, schema-first, grounding por embeddings, verificadores deterministas.

## Inputs

- `offerId`: oferta lista (status `EXTRACTED`) con sus `OfferItem[]` persistidos.
- `requestId`: implícito en la oferta. Sus `PurchaseRequestItem[]` son la otra punta del matching.

## Outputs

- `Reconciliation` único asociado a la oferta (1:1).
- `ReconciliationLine[]` cubriendo:
  - Cada `OfferItem` → línea con relación `match` / `partial_quantity` / `extra` / `low_confidence`.
  - Cada `PurchaseRequestItem` no cubierto → línea con relación `missing_from_offer`.
- `DecisionLog[]` con todas las llamadas al LLM y al embedder.
- `Offer.status = RECONCILED` (o `FAILED` si todo fracasa).

## Algoritmo

### 1. Setup

```
- Cargar PurchaseRequestItem[] del requestId.
- Cargar OfferItem[] del offerId.
- Crear Reconciliation (status running, totales en 0).
- Set Offer.status = RECONCILING.
```

### 2. Embeddings

Genera vectores para grounding determinista del shortlist.

**Texto a embeber por item**:

```
normalize(`${description} ${unit ?? ''}`)
```

`normalize()` aplica:

- Lowercase.
- Strip accents (`carañcter` → `caracter`).
- Trim + colapsar espacios.
- Mapear sinónimos de unidades (`m` → `metro`, `u` → `unidad`, `kg` → `kilogramo`) vía tabla.
- No traducir vocabulario del proveedor. El embedding se encarga.

**Llamadas**:

- 1 sola llamada a `text-embedding-3-small` con todos los `PurchaseRequestItem` (input es array, OpenAI lo soporta hasta 2048 inputs).
- 1 sola llamada para todos los `OfferItem`.
- Loguear ambas en `DecisionLog` con `kind: EMBED_REQUEST` y `EMBED_OFFER`.

**Cache**: los embeddings de items de solicitud se cachean en memoria de proceso por `requestId` (Map en memoria, TTL 1h). Si la misma solicitud recibe varias ofertas en la sesión, no se re-embebe.

### 3. Shortlist por similitud

Para cada `OfferItem`:

- Calcular coseno contra todos los `PurchaseRequestItem` vectorizados.
- Top-K = 5 candidatos con mayor score.
- Guardar el array `[{ requestItemId, similarity }]` para pasarlo al judge.

Implementación in-memory con dot product. Sin pgvector. 220 × 225 = 49.500 dot products es instantáneo.

### 4. Judge en batches

Agrupar los `OfferItem` en batches de 10. Por cada batch, una llamada a `gpt-4o-mini` con `response_format: json_schema`:

**Prompt system**:

```
Sos un asistente que decide si items ofertados por un proveedor corresponden
a items pedidos en una solicitud de compra. No inventás datos. Si ninguno
de los candidatos calza, devolvés relation: "extra". Tu salida es JSON
estricto según el schema.
```

**Prompt user (por batch)**:

```
Para cada item ofertado decidí cuál (si alguno) de sus candidatos es match.

Items ofertados:
1) [offerItemRef] descripción: "..." | unidad: "..." | cantidad: ...
   candidatos:
   - [requestItemRef A] "..." (qty: ..., unit: ..., score: 0.82)
   - [requestItemRef B] "..." (qty: ..., unit: ..., score: 0.71)
   - ...
2) ...

Reglas:
- Elegí 1 candidato si claramente es el mismo producto.
- "extra" si ninguno califica.
- "partial_quantity" si es el mismo producto pero la cantidad difiere.
- Confianza entre 0.0 y 1.0.
- rationale_short ≤ 200 chars, en español, sin repetir la descripción ni el precio.
```

**Schema Zod del output**:

```ts
const JudgeOutput = z.object({
  decisions: z.array(z.object({
    offerItemRef: z.string(),                         // ID local del batch
    relation: z.enum(['match', 'partial_quantity', 'extra']),
    requestItemRef: z.string().nullable(),            // ID del candidato elegido o null
    confidence: z.number().min(0).max(1),
    rationale_short: z.string().max(280),
  })),
})
```

`offerItemRef` y `requestItemRef` son IDs sintéticos del batch (ej. `O1`, `O2`, `RA`, `RB`) para que el modelo no tenga que memorizar IDs de DB largos. El servicio re-resuelve a IDs reales al persistir. Esto cumple la regla 2 (outputs referenciales cortos).

**Reintentos**:

- Schema roto → reintento con feedback (máx 2). Si falla, marcar el batch como `LOW_CONFIDENCE` para todos sus items y persistir el raw.
- Rate limit / 5xx → `p-retry` con backoff.

### 5. Verificadores deterministas

Después del judge, para cada decisión, validar reglas duras antes de persistir.

**a. Similaridad mínima**:

- Si `relation = match` o `partial_quantity` y el `similarity` del candidato elegido < `MIN_SIMILARITY` (default 0.65): downgrade a `low_confidence`. Flag: `below_similarity_threshold`.

**b. Rango de cantidad** (solo si `relation = match` o `partial_quantity`):

- `ratio = quantityOffered / quantityRequested`.
- Si `ratio < 0.1` o `ratio > 3.0`: flag `quantity_anomaly`. No downgrade automático, pero queda visible para el comprador.

**c. Compatibilidad de unidades**:

- Comparar `normalizedUnit(offer)` vs `normalizedUnit(request)`.
- Si no coinciden: flag `unit_mismatch`. No bloquea match (el proveedor puede ofrecer 100 metros para 100 metros de cable bajo "m" vs "metro"), pero deja la marca para revisión.

**d. Heurística "el LLM rechazó pero embedding alto"**:

- Si `relation = extra` pero el mejor candidato tenía `similarity ≥ 0.85`: loguear en `DecisionLog` como caso sospechoso. No cambiar la decisión del LLM (el modelo vio el contexto, decide), pero queda visible.

Estos verificadores son la regla 10 del CLAUDE.md.

### 6. Resolución de conflictos

Una request item puede aparecer como mejor match para varios offer items. Política:

- Conservar el match con mayor `confidence`.
- Los demás se reclasifican como `extra` con `rationale_short` actualizado: "candidato más confiable matcheó este item".
- Loguear como warning.

Caso especial: si dos offer items son claramente el mismo producto y suman para cubrir una qty, se permite mantener ambos como `partial_quantity` apuntando al mismo request item. Esto es split de proveedor, válido. Heurística: si la suma de qty de los dos cubre el pedido y descripciones idénticas, no aplicar la política anterior.

Decisión: para mantener simple, esta versión **no soporta split** (1 request → N offer items). Si aparece, el último gana, el resto se marca como `extra`. Loguear como mejora futura. La spec no se rompe; el dominio del challenge no menciona splits.

### 7. Reverse pass: items faltantes

Después de procesar todos los offer items:

- Conjunto `assignedRequestIds` = IDs de request items asignados como `match` o `partial_quantity`.
- Por cada `PurchaseRequestItem` con ID **no** en el conjunto → crear `ReconciliationLine`:
  - `relation = missing_from_offer`
  - `requestItemId = ese ID`
  - `offerItemId = null`
  - `confidence = 1.0` (es determinista, no requiere LLM)
  - `embeddingSimilarity = null`
  - `rationale = "No incluido en esta oferta"`

### 8. Persistencia

Todo en una transacción Prisma:

```ts
await prisma.$transaction([
  prisma.reconciliationLine.createMany({ data: lines }),
  prisma.reconciliation.update({
    where: { id: reconciliationId },
    data: {
      itemsCovered: count(['match', 'partial_quantity']),
      itemsMissing: count(['missing_from_offer']),
      itemsExtra: count(['extra']),
      itemsPartial: count(['partial_quantity']),
      itemsLowConfidence: count(['low_confidence']),
      totalPromptTokens: sum(promptTokens),
      totalCompletionTokens: sum(completionTokens),
      totalCostUsd: sum(costUsd),
      completedAt: new Date(),
    },
  }),
  prisma.offer.update({
    where: { id: offerId },
    data: { status: 'RECONCILED' },
  }),
]);
```

### 9. Falla

Si todo el judge falla (todos los batches → schema roto sin recovery, o el embedder falla):

- `Offer.status = FAILED` con `failureReason = "reconcile_failed: ${detalle}"`.
- Persistir las `ReconciliationLine` parciales que sí se lograron.
- `Reconciliation.completedAt` se setea con un flag de parcial. Pendiente decidir: ¿mantener Reconciliation visible aunque sea parcial? Sí, con etiqueta "Conciliación parcial — N items sin procesar".

## Algoritmo en pseudocódigo

```
async function reconcile(offerId):
  offer = loadOffer(offerId)
  requestItems = loadRequestItems(offer.requestId)
  offerItems = loadOfferItems(offerId)

  setOfferStatus(offer, 'RECONCILING')

  reqVectors = await embedRequestItems(requestItems)  # 1 call
  offerVectors = await embedOfferItems(offerItems)    # 1 call

  shortlists = computeShortlists(offerVectors, reqVectors, K=5)

  lines = []
  for batch of chunk(offerItems, size=10):
    decisions = await judgeBatch(batch, shortlists)
    decisions = applyVerifiers(decisions, shortlists)
    decisions = resolveConflicts(decisions, lines)
    lines.push(...toReconciliationLines(decisions))

  missingLines = computeMissingItems(requestItems, lines)
  lines.push(...missingLines)

  persist(lines, reconciliation, offer)
  setOfferStatus(offer, 'RECONCILED')
```

## Configuración (env / constantes)

| Var | Default | Significado |
|---|---|---|
| `MIN_SIMILARITY` | 0.65 | Coseno mínimo para mantener match |
| `SHORTLIST_K` | 5 | Candidatos por offer item |
| `JUDGE_BATCH_SIZE` | 10 | Items por llamada al judge |
| `QTY_RATIO_MIN` | 0.1 | Ratio mínimo qty offered/requested para no flagear |
| `QTY_RATIO_MAX` | 3.0 | Ratio máximo |
| `MAX_JUDGE_RETRIES` | 2 | Reintentos con feedback ante schema roto |
| `JUDGE_MODEL` | `gpt-4o-mini` | Modelo del judge |
| `EMBED_MODEL` | `text-embedding-3-small` | Modelo de embeddings |

## Performance esperada

case-simple (6 items request + ~7 items offer):
- 2 calls embed (~1s).
- 1 call judge (≤10 items).
- Total < 5s.

case-complex (220 items request + ~225 items offer):
- 2 calls embed (~2s).
- 23 calls judge en paralelo con `Promise.all` y límite 5 concurrent (`p-limit`).
- Total < 30s.

Costo case-complex (con `gpt-4o-mini` + `text-embedding-3-small`):

- Embeddings: ~450 items × 30 tokens ≈ 13.500 tokens × $0.020 / 1M = $0.0003.
- Judge: 23 batches × (~2000 input + ~1000 output) ≈ 46k input + 23k output = $0.0070 + $0.0138 = ~$0.022.
- **Total: ~$0.022 USD por conciliación de 220 items**.

## Casos de borde

- **Offer sin items**: `Offer.status = FAILED` con razón `no_offer_items`. No correr conciliación.
- **Request sin items**: error de seed. La oferta queda en `EXTRACTED` con flag `request_has_no_items`, no se concilia.
- **Embeddings devuelven dimensiones distintas para request vs offer**: imposible si se usa el mismo modelo, pero defensive: validar dimensión antes de coseno.
- **Schema del judge roto definitivamente**: persistir los offer items afectados como `low_confidence` con `rationale = "model output invalid"`, mantener el resto.
- **Rate limit prolongado**: `p-retry` agota reintentos → FAILED parcial. Documentar batches no procesados.
- **OfferItem con description vacía**: skip (no se concilia). Loguear warning.
- **PurchaseRequestItem con description vacía**: error de seed, validar antes.
- **Currency mismatch (offer en USD, request asume ARS)**: no es razón de no-match. Se flag con `currency_unknown` y queda visible.
- **Qty = 0 en oferta**: marcar como `extra` automático (el proveedor no cotizó cantidad útil), saltear judge.
- **Modelos devuelven IDs sintéticos inválidos** (`O7` en batch de 5): Zod cae, reintento.

## Trazabilidad

Cada `ReconciliationLine` apunta a un `DecisionLog` (vía `reconciliationLineId`). El log guarda:

- Prompt enviado al judge (truncado a 10k chars).
- Raw response del LLM.
- `candidatesConsidered`: array de `[{ requestItemId, similarity }]`.
- Decisión final y rationale.
- Tokens y costo.

Para verificadores deterministas que cambien la decisión (downgrade a `low_confidence`), se loguea un `DecisionLog` adicional con `kind: 'VERIFIER'` (extensión del enum). Por ahora se usa el campo `candidatesConsidered` con sub-key `verifier_flags`.

Decisión: extender el enum `DecisionKind` en un schema bump posterior (`VERIFIER`, `MAP_COLUMNS`). Por ahora se reusa `JUDGE_BATCH` y se distingue por `candidatesConsidered.subKind`. Evitar churn de DB en este momento.

## Tests

1. **case-simple end-to-end**: corre la conciliación entera contra DB de test con fixtures cargadas. Asserts:
   - 6 lines de match + extras esperados según `reconciliation_guide.md`.
   - 0 missing_from_offer (todos los items pedidos están cubiertos por al menos una oferta).
2. **case-complex end-to-end**: 220 items, validar que ≥ 95% son `match` o `partial_quantity`.
3. **Shortlist correctness**: dados embeddings sintéticos, asegurar top-5 está bien calculado.
4. **Batch judge schema fail**: mock devuelve JSON inválido 3 veces → afecta a 1 batch, el resto sigue.
5. **Verifier downgrade**: similarity = 0.5 con match del LLM → línea queda `low_confidence`.
6. **Conflict resolution**: dos offer items matchean el mismo request → uno match, otro extra con rationale específico.
7. **Reverse pass**: request item no cubierto → línea `missing_from_offer` automática.
8. **Empty offer**: status FAILED.
9. **Cost tracking**: tras conciliar, `Reconciliation.totalCostUsd > 0` y `totalPromptTokens > 0`.
10. **Idempotency**: re-correr conciliación sobre la misma oferta no duplica lines (debe limpiar previas si se permite re-correr). Política: si Offer.status = RECONCILED, no re-correr salvo flag explícito `force=true`.

## Criterios de aceptación

- case-simple termina en < 5s con cobertura correcta (≥ 5 matches según guía).
- case-complex termina en < 30s con ≥ 200 matches.
- Embeddings se llaman exactamente 2 veces por conciliación (1 request, 1 offer).
- Cada `ReconciliationLine` con `match` tiene `embeddingSimilarity ≥ 0.65`.
- `DecisionLog` poblado con costo > 0 por cada llamada.
- Re-conciliar sin `force=true` no hace nada (idempotente).

## Out of scope

- Split (1 request → N offer items contribuyendo). Documentado, no implementado.
- Re-ranking con un modelo más caro (`gpt-4o` full) si el judge devuelve baja confianza global. Mejora futura.
- pgvector persistente. In-memory alcanza para 220.
- Aprendizaje activo (feedback del comprador entrena prompts futuros).
- Multi-oferta comparativa (elegir mejor oferta entre N). El challenge solo pide conciliar 1 oferta a la vez.

## Próximo

- `06-output-markdown.md`: formato del resumen narrativo para el comprador.
