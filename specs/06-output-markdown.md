# Spec 06 — Resumen Markdown para comprador

## Objetivo

Generar un documento Markdown legible que el comprador pueda revisar sin abrir el archivo original ni la UI. Debe ser determinista, en español, descargable y persistido en `Reconciliation.summary`.

## Regla crítica

**El Markdown se genera con template determinista, no con LLM.** Esto cumple la regla 1 del workflow AI (CLAUDE.md): el LLM no es source-of-truth de números. Todos los datos numéricos salen de DB. Los `rationale` por línea ya fueron persistidos por el judge; el render solo los inserta tal cual.

Sin llamadas al LLM en esta etapa. Cero costo adicional. Cero riesgo de hallucination.

## Inputs

- `reconciliationId` (con joins a Offer, Supplier data, lines, request items, offer items).
- Locale: `es-AR` fijo.
- Timezone: `America/Argentina/Buenos_Aires` para fechas.

## Output

Un string Markdown. Persistido en `Reconciliation.summary` (text). Descargable como archivo desde la UI:

```
oferta-{externalIdSolicitud}-{slug(supplierName)}-{YYYY-MM-DD}.md
```

Slugify con `slugify` lib o regex propio (lowercase, strip accents, espacios → `-`).

## Estructura del documento

```markdown
# Conciliación de oferta — {supplierName}

## Resumen

- **Solicitud:** {externalIdSolicitud} — {titleSolicitud}
- **Proveedor:** {supplierName ?? '(no identificado)'}
- **Archivo origen:** `{sourceFile}`
- **Fecha de la oferta:** {offerDate ?? '(no especificada)'}
- **Procesado:** {createdAt} ({timezone abrev.})
- **Estado:** Conciliada

## Indicadores

| Métrica                             |                     Valor |
| ----------------------------------- | ------------------------: |
| Items pedidos                       |            {totalRequest} |
| Items cubiertos (match + parciales) | {covered} ({coveredPct}%) |
| Items con cantidad parcial          |                 {partial} |
| Items faltantes                     |                 {missing} |
| Items sobrantes en la oferta        |                   {extra} |
| Items con baja confianza            |           {lowConfidence} |

{observationsBlock}

## Items conciliados

|   # | Pedido | Ofertado | Cant. pedida | Cant. ofertada | Unidad | Precio unit. | Relación | Justificación |
| --: | ------ | -------- | -----------: | -------------: | ------ | -----------: | -------- | ------------- |

{rowsMatchedAndPartial}

## Items faltantes

{rowsMissingOrParagraphIfNone}

## Items sobrantes en la oferta

{rowsExtraOrParagraphIfNone}

## Items con baja confianza

{rowsLowConfidenceOrParagraphIfNone}

## Trazabilidad

- **Modelo de extracción:** {extractModel}
- **Modelo de conciliación:** {judgeModel}
- **Modelo de embeddings:** {embedModel}
- **Llamadas al LLM:** {decisionLogCount}
- **Tokens (prompt / completion):** {totalPromptTokens} / {totalCompletionTokens}
- **Costo estimado:** US$ {totalCostUsd}
- **Duración total:** {durationSec}s

---

_Generado automáticamente el {generatedAt}. Verificar contra la oferta original antes de adjudicar._
```

## Detalles de render

### Formato de números

`Intl.NumberFormat('es-AR', { ... })`:

- Cantidad: hasta 3 decimales, sin trailing zeros (`100`, `1.234,5`, `0,750`).
- Precio: 2 o 4 decimales según el dato. Símbolo de moneda al inicio si está definido (`$ 1.234,56` o `US$ 99,95`). Si moneda null → solo el número.
- Costo USD del LLM: 4 decimales (`US$ 0,0220`).
- Porcentaje: entero (`85%`).

### Formato de fechas

`Intl.DateTimeFormat('es-AR', { dateStyle: 'long' })`:

- Display: `15 de mayo de 2026`.
- En timestamp de "Procesado": agregar hora `15 de mayo de 2026, 14:32 ART`.

### Descripciones largas

Truncar a 80 chars en tabla con `...` al final. El comprador siempre tiene el detalle en la UI con tooltip o expandible. El Markdown es resumen, no exhaustivo.

```ts
function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
```

### Bloque de observaciones (`observationsBlock`)

Si `Offer.observations` no es null:

```markdown
## Observaciones del proveedor

{Offer.observations}
```

Si es null o vacío: la sección entera se omite (no renderizar header vacío).

### Filas de tabla

Ordenadas por `lineNumber` del offer item para `match`/`partial_quantity`. Por `requestItem.externalItemId` para `missing_from_offer`. Por `lineNumber` para `extra`.

**Match + parciales** (`rowsMatchedAndPartial`):

```
| {lineNumber} | {truncate(requestItem.description)} | {truncate(offerItem.description)} | {qty(requestItem.quantity)} | {qty(offerItem.quantity)} | {offerItem.unit} | {price(offerItem.unitPrice, offerItem.currency)} | {relationLabel} | {rationale} |
```

`relationLabel`:

- `match` → `✓ Coincide`
- `partial_quantity` → `~ Cant. parcial`
- `low_confidence` → `? Baja confianza`

Sin emojis decorativos. El `✓ ~ ?` son señales tipográficas mínimas y se ven bien en Markdown crudo. Si la regla "sin emojis" de CLAUDE.md choca con esto, queda sin ellos: `Coincide`, `Cant. parcial`, `Baja confianza`. Decisión final: **sin íconos tipográficos, solo texto**. Coherente con regla autor.

**Missing**:

```
| {externalItemId} | {truncate(description)} | {qty} | {unit} |
```

Tabla mínima de 4 columnas.

Si no hay missing:

```
_Todos los items pedidos están cubiertos por esta oferta._
```

**Extra**:

```
| {lineNumber} | {truncate(description)} | {qty} | {unit} | {price} | {rationale} |
```

Si no hay extra:

```
_La oferta no incluye items sobrantes._
```

**Low confidence**: misma estructura que match, con columna adicional `confidence` (formato `0,52`) y `flags` joined con comas.

Si no hay low confidence:

```
_No se detectaron decisiones de baja confianza._
```

## Builder

Función pura en `src/core/output/markdown-builder.ts`:

```ts
export function buildMarkdownSummary(data: ReconciliationView): string {
  const lines: string[] = [];
  lines.push(header(data));
  lines.push(summarySection(data));
  lines.push(indicatorsTable(data));
  if (data.offer.observations) lines.push(observationsSection(data));
  lines.push(matchedSection(data));
  lines.push(missingSection(data));
  lines.push(extraSection(data));
  lines.push(lowConfidenceSection(data));
  lines.push(traceabilitySection(data));
  lines.push(footer(data));
  return lines.join('\n\n');
}
```

Cada función retorna un fragmento Markdown. Composición simple, fácil de testear cada sección por separado.

`ReconciliationView` es un type derivado:

```ts
type ReconciliationView = Prisma.ReconciliationGetPayload<{
  include: {
    offer: { include: { items: true; request: { include: { items: true } } } };
    lines: { include: { offerItem: true; requestItem: true } };
  };
}>;
```

## Persistencia

Tras conciliar, el builder corre y guarda:

```ts
await prisma.reconciliation.update({
  where: { id },
  data: { summary: buildMarkdownSummary(view) },
});
```

Se persiste para:

- Descarga rápida sin recomputar.
- Auditoría: si se cambia la conciliación, el summary anterior queda histórico (versionarlo es out of scope; por ahora sobrescribe).

Re-generar bajo demanda: si el usuario hace clic en "regenerar resumen", se re-renderiza desde los datos actuales y se sobrescribe `summary`. Útil si los `rationale` se editaron a mano (out of scope, pero el botón queda preparado).

## UI

En `/ofertas/[id]` tab "Resumen Markdown":

- Render del MD usando `marked` (lib liviana, ya está en oceans-hr).
- Botón "Descargar .md" → server action que devuelve el archivo.
- Botón "Copiar al portapapeles" → copia el raw.
- Botón "Regenerar" → re-corre el builder.

## Casos de borde

- **`Reconciliation` sin lines**: render con todas las tablas en estado "vacío" + warning prominente al inicio. Eso indica que algo falló silenciosamente.
- **`Offer.supplierName = null`**: el header dice `Proveedor: (no identificado)`. El filename usa `sin-proveedor` como slug.
- **Descripción con caracteres Markdown crudos** (`|`, `*`, `_`, `` ` ``): escapar en el render de tablas. `|` se vuelve `\|`. El resto Markdown lo tolera en celdas.
- **Saltos de línea en `observations` u `rationale`**: en celdas de tabla, reemplazar `\n` por espacio. En sección de observaciones libre, preservar saltos.
- **Costo USD < $0,0001**: render como `< US$ 0,0001` en lugar de `US$ 0,0000`. Honestidad sobre la magnitud.
- **`completedAt` null** (conciliación en curso): el render no debería ejecutarse en ese estado. Si pasa, fallar explícito.
- **Idioma**: todo el documento en español rioplatense. "Costo" no "coste". "Conciliada" no "Reconciliada".
- **Items con qty null**: renderizar como `—` (em dash), no `null` ni `0`.
- **Items con `flags`**: agregar nota inline en la columna rationale: `(cantidad fuera de rango)` si `quantity_anomaly`, `(unidades distintas)` si `unit_mismatch`, etc.

## Decisiones de diseño

- **Sin frontmatter YAML**: el Markdown apunta a humanos, no a un static site generator.
- **Sin headers HTML embebidos**: pure Markdown. Render limpio en cualquier viewer (GitHub, VS Code, Obsidian).
- **Tablas en formato GFM**: con `|---|` separadores. Soportado universalmente.
- **Sin imágenes, sin íconos en línea**: minimalista. El comprador lee texto, no infografía.
- **Sin código embebido salvo `{sourceFile}`** en backticks para distinguir nombres de archivo.

## Tests

Vitest snapshot + casos específicos.

1. **Snapshot completo**: fixture de `ReconciliationView` con 6 lines (case-simple) → Markdown match exacto contra `tests/fixtures/expected-summary-simple.md`.
2. **Snapshot case-complex**: 220 lines → Markdown bien formado, sin overflow de tabla.
3. **Sección missing vacía**: render incluye el paragraph "Todos los items pedidos están cubiertos".
4. **Sección extra vacía**: idem con "La oferta no incluye items sobrantes".
5. **Observaciones presentes**: render incluye la sección. Ausentes → no aparece.
6. **Número con formato es-AR**: `1500.5` → `1.500,5`. `0.022` USD → `US$ 0,0220`.
7. **Fecha en es-AR con timezone**: `2026-05-15T17:32:00Z` → `15 de mayo de 2026, 14:32 ART`.
8. **Descripción larga truncada**: > 80 chars termina con `…`.
9. **Filename slugify**: `Suministros & Co.` → `suministros-co`.
10. **Escape de pipe en celdas**: descripción con `Cable | unipolar` → `Cable \| unipolar` en la celda.

## Criterios de aceptación

- Builder es función pura, sin side effects, sin I/O.
- Render completo de case-simple en < 50ms.
- Render completo de case-complex en < 200ms.
- `Reconciliation.summary` siempre se popula al terminar la conciliación.
- Markdown abierto en GitHub renderiza correctamente las tablas.
- Cero llamadas al LLM en este flujo (verificable contando `DecisionLog` antes y después del render).

## Out of scope

- Export a PDF (Markdown alcanza, el spec lo confirma).
- Render con plantillas tipo Handlebars o similar (template literals alcanzan).
- Internacionalización de la salida (solo es-AR).
- Versionado del summary (sobrescribe).
- Edición manual del summary por el usuario.

## Próximo

- `07-traceability.md`: consulta y visualización de `DecisionLog` en la UI.
