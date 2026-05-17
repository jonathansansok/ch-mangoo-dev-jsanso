# Spec 00 — Overview

## Objetivo

Procesar ofertas de proveedor en PDF/XLSX y conciliarlas contra solicitudes de compra cargadas en DB. Sin IDs compartidos. Sin descripciones idénticas. Trazabilidad de cada decisión.

## Stack

- **TypeScript** estricto.
- **Next.js 15** App Router. UI + API + server actions en un solo deploy.
- **Prisma + MySQL 8**. Dockerizado en dev, Railway managed MySQL en prod.
- **Zod** para schemas de I/O, output del LLM y env vars.
- **OpenAI**: `gpt-4o-mini` para extracción y judge, `text-embedding-3-small` para shortlist.
- **pdf-parse** para PDFs simples, PDF nativo al modelo cuando el layout rompe el texto plano.
- **xlsx** (sheetjs) para Excel.
- **Tailwind** + componentes custom (sin shadcn, ver `ui-style.md`).
- **Inter** como fuente única.
- **Vitest** para tests.
- **pino** para logs.
- **Railway unified** deploy (app + MySQL en mismo proyecto). Recruiter pidió Vercel como preferencia pero aceptó alternativas; Railway elimina cold starts, timeouts serverless y mantiene todo en una sola plataforma.
- **GitHub Actions** CI con deploy a Railway via `railway up`.

Sin Nest. Sin Tanstack Query (server actions cubren). Sin DDD pesado. Sin Vercel.

## Deploy

Railway unified. Un proyecto con dos servicios:

- **app**: Next.js build, Dockerfile multi-stage o nixpacks autodetect. Variables: `DATABASE_URL`, `OPENAI_API_KEY`, `MAX_TOKENS_PER_RUN`, `NODE_ENV=production`.
- **mysql**: plugin managed MySQL 8 de Railway. `DATABASE_URL` se inyecta automático en `app`.

Preview environments: Railway crea un environment por cada PR si se habilita. URL única para mostrar al recruiter.

Estimado: $5 USD/mes con plan Hobby. Sin cold starts, sin timeouts serverless.

CI/CD: GitHub Action corre `railway up --service app` con `RAILWAY_TOKEN` como secret. Deploy automático en push a `main`.

## Arquitectura

Hexagonal pragmático.

```
src/
  core/                       # lógica pura, sin I/O
    domain/                   # tipos del dominio
    reconcile/                # algoritmo shortlist + judge
  infra/
    db/                       # Prisma client + repos
    extractors/               # pdf.ts, xlsx.ts
    ai/                       # OpenAI wrapper con token logging
  app/                        # rutas Next, server actions, páginas
    api/health/
    api/version/
  env.ts                      # validación Zod de env
  lib/                        # helpers
scripts/
  seed.ts                     # CSV → DB
prisma/
specs/
fixtures/scenarios/
```

Strategy para extractor (PDF vs XLSX). Adapter para provider AI. Repository para Prisma. Nada más. Sin EventBus, sin CQRS, sin DI container.

## Flujo end-to-end

1. Seed CSVs a DB con upsert idempotente.
2. Usuario sube oferta PDF/XLSX.
3. Parser extrae texto/filas crudas.
4. LLM normaliza a schema Zod → `Offer` + `OfferItem[]`.
5. Persistir.
6. Reconciliar: embeddings de items pedidos + ofrecidos, top-5 candidatos por offer item, batches al judge.
7. Persistir `Reconciliation` + `ReconciliationLine` + `DecisionLog`.
8. UI muestra oferta, tabla conciliada, Markdown summary descargable.

## Reglas duras del workflow AI

Contexto: el equipo planteó en la entrevista técnica que su último problema fue que **OpenAI perdía contexto en ofertas largas** y devolvía precios incorrectos al cliente. Diseño explícito para evitarlo:

1. **El LLM no es source-of-truth de números.** Precios, qty, totales viven en DB tras la extracción. Outputs posteriores devuelven IDs y rationale corto. UI/Markdown hidratan desde DB.
2. **Outputs referenciales, no narrativos.** Reconciliación devuelve `{ request_item_id, relation, confidence, rationale_short }`. Sin repetir descripción ni precio.
3. **Una llamada, una responsabilidad.** Prompts separados: header oferta, items oferta, batch de reconciliación. Sin mega-prompt con todo el contexto adentro.
4. **Batches chicos y autocontenidos.** Lotes de ≤10 offer items con su shortlist completa. Sin estado entre llamadas. Cero context drift por longitud.
5. **Schema-first con Zod.** Salida estructurada vía `response_format` o function calling. Si rompe schema, reintento con feedback (máx 2), después fallback: línea con `relation=extra, lowConfidence=true` y raw persistido.
6. **Grounding por embeddings.** Shortlist se calcula con coseno antes del judge. El modelo elige entre candidatos pre-filtrados, no "recuerda" la solicitud entera.
7. **Streaming es UX, no fix de contexto.** Stream de progreso al cliente durante extracciones largas. No se confunde con la solución del problema real, que ya está resuelto por las reglas 1-6.
8. **Cache por hash de archivo.** `sha256(file)` como key en tabla `ExtractionCache`. Mismo archivo no re-llama al LLM.
9. **DecisionLog por llamada.** Persistir model, tokens in/out, costo estimado, prompt, raw response, candidatos considerados, decisión, rationale, duración.
10. **Verificadores deterministas post-LLM.** Después del judge: similaridad embedding ≥ 0.65 si no se marca `lowConfidence=true` (conserva la relación del judge). Qty ofertada dentro de rango (0.1× a 3× la pedida) si no flag `quantity_anomaly`. Unidades compatibles tras normalizar (`metro`↔`m`, `unidad`↔`u`) si no flag `unit_mismatch`. La consigna define 4 relaciones; la baja confianza es un flag, no una quinta relación.

## Volumen (220 ítems)

No LLM call per par (50.000 pares es inviable).

1. Embed items de la solicitud una vez, cachear por `request_id`.
2. Embed items de la oferta.
3. Por cada offer item, top-5 candidatos por coseno (in-memory, sin pgvector porque 220 vectores entran en RAM).
4. Judge en batches de ≤10 con sus shortlists adentro. Devuelve match o `extra`.
5. Reverse pass: items de solicitud sin asignar → `missing_from_offer`.

Costo estimado case-complex: ~225 embeddings + ~25 judge calls. Aprox $0.10 USD con `gpt-4o-mini`.

## Trazabilidad

`DecisionLog` por cada llamada al LLM:

- `model`, `prompt_tokens`, `completion_tokens`, `cost_usd_estimate`
- `prompt` truncado, `raw_response`
- `candidates_considered` con IDs y scores
- `decision` final, `rationale`
- `processed_at`, `duration_ms`

## Salida

Tres vistas, en español:

1. **Oferta procesada**: header (proveedor, fecha, observaciones) + tabla de items extraídos.
2. **Tabla conciliada**: offer item ↔ request item con relación (`match`, `partial_quantity`, `missing_from_offer`, `extra`), diff de cantidad, rationale.
3. **Markdown summary** descargable: texto narrativo para comprador.

## Casos de borde

- Oferta sin proveedor identificable → flag, no fallar.
- Items duplicados en la oferta → consolidar, anotar.
- Qty ofertada > pedida → `partial_quantity` con flag `excess`.
- Qty 0 o nula → tratar como missing.
- Precio ausente → permitido, marcar.
- Unidades distintas → normalizar antes de comparar.
- Archivo corrupto o vacío → error claro, no crash.
- LLM con schema roto → reintento con feedback, después fallback.
- Archivo ya procesado (mismo hash) → reusar cacheado.

## Criterios de aceptación

- `pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev` levanta todo en <5 min desde cero.
- Case-simple corre end-to-end y produce Markdown similar (no idéntico) a su guía.
- Case-complex (220 items) corre sin timeouts en <60s.
- Tests pasan en CI.
- Deploy Railway funciona (app + MySQL en mismo proyecto), preview deploy en cada PR.
- README con instrucciones completas.

## Out of scope

- Auth de usuarios (demo single-tenant).
- Multi-tenant.
- Export a PDF (Markdown alcanza).
- Edición manual post-AI.
- Comparar múltiples ofertas entre sí.
- Sentry, OpenTelemetry, RAG con vector DB persistente. Quedan en "mejoras futuras" del README.

## Próximas specs

- `01-data-model.md` — entidades Prisma
- `02-seed.md` — CSV → DB
- `03-extract-pdf.md` — pipeline PDF
- `04-extract-xlsx.md` — pipeline XLSX
- `05-reconcile.md` — algoritmo
- `06-output-markdown.md` — formato resumen
- `07-traceability.md` — DecisionLog
- `08-api-and-ui.md` — rutas y páginas
- `09-testing-strategy.md` — unit + e2e + mocks
- `10-ci-cd.md` — workflows + deploy
