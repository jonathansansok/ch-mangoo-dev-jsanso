# Pre-entrega — Checklist de robustez

Lista corta antes de cerrar entrega. Cada ítem debe quedar verificado, no agregado feature nuevo.

## 1. Markdown summary descargable ✅

- [x] Endpoint `/api/ofertas/[id]/summary` (Content-Type `text/markdown; charset=utf-8`, Content-Disposition `attachment`).
- [x] Botón Descargar/Copiar/Regenerar en `SummaryActions` tab Resumen.
- [x] Builder cubre tildes/ñ vía UTF-8, escapa pipes/newlines, secciones opcionales.
- [x] 18 tests pasan en `src/core/output/`.

## 2. Edge cases del spec ✅

- [x] Precio ausente → `unitPrice null` permitido por schema, `formatPrice` muestra `—`.
- [x] Unidades distintas → `unitsCompatible` en `normalize-text`, flag `unit_mismatch`.
- [x] Oferta sin proveedor → builder muestra `(no identificado)`, XLSX intenta fallback con `inferSupplierFromFilename`.
- [x] Qty ofertada > pedida → verifier flag `excess` + `quantity_anomaly` si fuera de rango.
- [x] Archivo corrupto o vacío → `PdfTextError`/`XlsxTextError` → pipeline setea `FAILED` con `failureReason`.
- [x] LLM con schema roto → `callChat` reintenta, `judgeBatch` cae a `relation=extra, lowConfidence=true`.
- [x] Mismo hash → `ExtractionCache` HIT + offer reuse en `uploadOffer`.
- [~] Qty 0 o nula → no se downgradea a `MISSING` explícito, el judge decide. Aceptable para entrega.
- [~] Items duplicados → no hay dedupe explícito en `mergeChunks`. Aceptable, raro en práctica.

## 3. README probado en máquina limpia ✅

- [x] Quickstart `pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev` documentado.
- [x] `.env.example` con todas las vars, env.ts en sync (Zod valida al boot).
- [x] Paso a paso de "Procesar una oferta" en README.
- [x] Diagrama modelo de datos + link a `prisma/schema.prisma`.
- [x] Sección "Estrategia de extracción" (PDF chunked + XLSX path A/B).
- [x] Sección "Estrategia de conciliación" (embeddings + judge batches + reverse pass) + bloque "Volumen".
- [x] Sección "Trazabilidad" (DecisionLog + candidatesConsidered).
- [x] Tabla Knobs con todas las env vars y su efecto.
- [x] `pnpm typecheck` + `pnpm lint` verdes. 149 tests pasan.

## 4. Limitaciones y mejoras futuras ✅

- [x] Sección "Limitaciones y mejoras futuras" en README: pares ambiguos, pgvector, multi-oferta, Sentry/OTEL, auth.
- [x] Costo por escenario en README (tabla resultados) y `docs/benchmarks.md`.
- [x] Comparación de modelos judge (`gpt-4o-mini` vs `gpt-4.1-mini`) en benchmarks.

## Out of scope (descartado explícito)

- Import CSV/XLSX de solicitudes en runtime (spec pág. 1 lo descarta).
- Comparar múltiples ofertas entre sí.
- Auth, multi-tenant, export PDF, edición manual post-AI.
