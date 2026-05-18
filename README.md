# Mangoo Dev. Sansó Challenge

[![CI](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/ci.yml/badge.svg)](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/ci.yml)
[![Deploy](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/deploy.yml/badge.svg)](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/deploy.yml)
![Node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)
[![Anti-hallucination](https://img.shields.io/badge/anti--hallucination-3%20tests-8957e5)](#tests-anti-alucinación-diferencial-del-diseño)

Procesa ofertas de proveedor (PDF/XLSX) y las concilia contra solicitudes de compra cargadas en DB. La oferta no comparte IDs con la solicitud ni copia las descripciones, así que la conciliación es semántica.

Challenge técnico de Mangoo Dev. El spec completo está en `docs/challenge.pdf` y los datos de prueba en `fixtures/scenarios/`.

## Resultados

Medido contra el `reconciliation_guide.md` de cada escenario (ver `docs/benchmarks.md`):

| Escenario         | Cobertura       | Costo   | Tiempo |
| ----------------- | --------------- | ------- | ------ |
| case-simple PDF   | 100% (5/5)      | $0.0005 | ~30s   |
| case-simple XLSX  | 100% (7/7)      | $0.0003 | ~10s   |
| case-complex PDF  | 99.4% (171/172) | $0.052  | 324s   |
| case-complex XLSX | 99.1% (218/220) | $0.064  | 68s    |

Los pares no recuperados (`Bandeja↔Cubeta pintura`, `Pinza universal↔combinada`) son ambiguos a propósito: el judge prefiere quedarse en `missing+extra` antes que asumir un match incorrecto. Bajar `REVERSE_PASS_MIN_CONFIDENCE` los recupera pero abre falsos positivos peores (`Llave francesa↔Llave de paso`).

## Calidad

- CI: `lint` + `typecheck` + `test` + `build` en paralelo, cache pnpm + `.next/cache`.
- 156 unit (<1s, sin I/O) + 4 e2e con DB real + MSW (~26s, $0).
- Tests anti-alucinación específicos del pain point (T1/T2/T3, ver [Testing ↓](#tests-anti-alucinación-diferencial-del-diseño)).
- Railway preview por PR, deploy automático en merge a `main`.

## Stack

- **Next.js 15** App Router (UI + API + server actions en un solo deploy)
- **TypeScript** estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Prisma + MySQL 8** (dockerizado en dev, Railway managed en prod)
- **Zod** para schemas de I/O, output del LLM y env vars
- **OpenAI**: `gpt-4o-mini` para extracción, `gpt-4.1-mini` para judge, `text-embedding-3-small` para shortlist
- **unpdf** para PDFs (sin binding nativo), **sheetjs** para XLSX
- **Tailwind 4** + componentes custom (sin shadcn)
- **Vitest** + MSW para mocks de OpenAI, **pino** para logs

## Quickstart

Requiere Node 22+, pnpm y Docker.

```bash
cp .env.example .env.local
# editar OPENAI_API_KEY

pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

App en `http://localhost:3000`. Health en `/api/health`, version (commit SHA) en `/api/version`.

### Procesar una oferta (UI)

1. Ir a `Ofertas → Subir`
2. Elegir la solicitud destino (seed crea `REQ-OFI-2026-001` y `REQ-MOP-2026-001`)
3. Subir un PDF o XLSX de `fixtures/scenarios/*/offers/`
4. El pipeline corre en background. La página de detalle hace polling y muestra:
   - Header extraído (proveedor, fecha, observaciones)
   - Tabla de items ofertados con precios y cantidades
   - Tabla conciliada con `match / parcial / faltante / sobrante` y flag `baja confianza` cuando los verificadores no avalan al judge
   - Markdown descargable para el comprador

### Procesar una oferta (CLI, sin UI)

La consigna del challenge dice explícitamente que la UI es opcional. Para correr el pipeline headless y obtener los 4 entregables como archivos:

```bash
pnpm process-offer fixtures/scenarios/case-simple/offers/oferta_comercial_oficinas.pdf
```

Genera en `output/<proveedor-hash>/`:

- `oferta.json` — cabecera + items extraídos.
- `tabla.md` — tabla conciliada (match, parcial, faltante, sobrante).
- `summary.md` — resumen Markdown para el comprador.
- `trace.csv` — una fila por llamada al LLM con tokens, costo y duración.

Solicitud destino se detecta del path (`case-simple` → `REQ-OFI-2026-001`, `case-complex` → `REQ-MOP-2026-001`). Override con `--request <externalId>`.

## Modelo de datos

```
PurchaseRequest ──┬─ PurchaseRequestItem
                  │
                  └─ Offer ──┬─ OfferItem
                             ├─ Reconciliation ── ReconciliationLine
                             └─ DecisionLog (uno por llamada al LLM)
ExtractionCache (sha256 → payload normalizado)
```

Ver `prisma/schema.prisma` para campos exactos. Notas:

- `Offer.status` es máquina de estados: `PENDING → EXTRACTING → EXTRACTED → RECONCILING → RECONCILED | FAILED`. La consigna no impone estados; este enum es decisión propia.
- `ReconciliationLine.relation` tiene los 4 valores que pide la consigna: `MATCH`, `PARTIAL_QUANTITY`, `MISSING_FROM_OFFER`, `EXTRA`. La baja confianza es un flag ortogonal (`lowConfidence: boolean`), no una relación adicional — preserva el veredicto original del judge cuando los verificadores no lo avalan.
- `ReconciliationLine.flags` (Json) guarda alertas de verificadores: `quantity_anomaly`, `unit_mismatch`, `low_similarity`.
- `DecisionLog.candidatesConsidered` (Json) guarda los IDs y scores que entraron al shortlist, para trazabilidad de por qué el judge decidió lo que decidió.

## Estrategia de extracción

### PDF

`unpdf` extrae texto plano. Si el archivo es chico (un chunk <12k chars) va una sola llamada al LLM. Si es largo, se chunkea por límites de página y se procesan los chunks en paralelo con `p-limit`. Cada chunk devuelve sus items y se concatenan deterministicamente.

Cache por `sha256(file)`: re-subir el mismo archivo no re-llama al LLM.

### XLSX

Dos caminos:

- **Path A — direct (sin LLM por items)**: una heurística detecta columnas estándar (`código`, `descripción`, `qty`, `precio unit`). Si el match alcanza confianza, parsea las filas deterministicamente. case-complex XLSX (225 items) corre en ~270ms.
- **Path B — fallback**: si la heurística no cubre, el LLM mapea columnas una sola vez sobre el header, y después se reparsea deterministicamente. Los números siempre vienen del cell, nunca del LLM.

## Estrategia de conciliación

El problema central planteado en la entrevista: OpenAI pierde contexto en ofertas largas y devuelve precios incorrectos al cliente. El diseño evita eso con varias capas:

1. **Embeddings primero**. Items de la solicitud se embeben una vez y se cachean. Para cada offer item se calcula top-K (`SHORTLIST_K=10`) candidatos por coseno.
2. **Judge en batches chicos**. Cada batch de ≤10 offer items lleva su shortlist completa. El LLM solo elige entre candidatos pre-filtrados, no "recuerda" la solicitud entera.
3. **Outputs referenciales**. El judge devuelve `{ request_item_id, relation, confidence, rationale_short }`. Nunca repite descripciones ni precios — esos viven en DB.
4. **Verificadores post-LLM**. Si la similaridad embedding cae bajo `MIN_SIMILARITY=0.55` y la confianza del judge bajo `TRUST_JUDGE_CONFIDENCE=0.7`, la línea se marca con `lowConfidence=true` pero conserva su `relation` original (`MATCH` o `PARTIAL_QUANTITY`). Así el comprador ve la decisión del judge y el cuestionamiento del verificador, sin perder ninguno de los dos. Qty fuera de rango `[0.1×, 3×]` añade flag `quantity_anomaly`.
5. **Reverse pass**. Los items de la solicitud sin match se vuelven a embeber contra los extras de la oferta. Si el judge confirma con confianza ≥ `REVERSE_PASS_MIN_CONFIDENCE=0.7`, se recupera el par. Recupera casos como `Canaleta PVC ↔ Ducto polipropileno pasacable`.

### Volumen

case-complex tiene 220 items. O(n·m) calls al LLM son ~50k pares, inviable.

```
220 requests + 225 offer items
= 445 embeddings (cacheables por request_id)
+ ~23 judge batches forward
+ ~5 judge batches reverse pass
≈ 30 calls totales, $0.10 USD
```

## Trazabilidad

Cada llamada al LLM produce un `DecisionLog`:

- `model`, `promptTokens`, `completionTokens`, `costUsd`
- `prompt` completo y `rawResponse`
- `candidatesConsidered` (IDs + scores que entraron al shortlist)
- `durationMs`

Cada `ReconciliationLine` tiene FK al `DecisionLog` que la produjo. La UI muestra el rationale y, expandiendo, los candidatos considerados. Resuelve el problema concreto: poder explicar al cliente _por qué_ el sistema clasificó como clasificó.

## Knobs (env vars)

| Var                           | Default      | Efecto                                                   |
| ----------------------------- | ------------ | -------------------------------------------------------- |
| `SHORTLIST_K`                 | 10           | Top-K candidatos por offer item para forward judge       |
| `JUDGE_BATCH_SIZE`            | 10           | Items por batch al judge                                 |
| `MIN_SIMILARITY`              | 0.55         | Verificador post-judge: por debajo marca `lowConfidence` |
| `TRUST_JUDGE_CONFIDENCE`      | 0.7          | Si confianza del judge ≥ esto, no marca `lowConfidence`  |
| `REVERSE_PASS_K`              | 8            | Top-K extras candidatos para cada unassigned request     |
| `REVERSE_PASS_MIN_CONFIDENCE` | 0.7          | Confianza mínima para aceptar recovery                   |
| `QTY_RATIO_MIN/MAX`           | 0.1 / 3.0    | Rango aceptable de cantidad ofertada vs pedida           |
| `MAX_TOKENS_PER_RUN`          | 100000       | Budget guard por pipeline                                |
| `EXTRACT_MODEL`               | gpt-4o-mini  | Modelo para extracción                                   |
| `JUDGE_MODEL`                 | gpt-4.1-mini | Modelo para forward judge y reverse pass                 |

## Testing

```bash
pnpm test:unit         # 156 unit (src/**/*.test.ts) — sin I/O, <1s
pnpm test:integration  # gated por OPENAI_API_KEY real
pnpm test:e2e          # 4 e2e — DB real + MSW (1 más skip si no hay OPENAI_API_KEY real)
pnpm typecheck
pnpm lint
```

### Pirámide

| Nivel                      | Cant. | Foco                                                                         | Requiere                   |
| -------------------------- | ----- | ---------------------------------------------------------------------------- | -------------------------- |
| Unit                       | 156   | core puro (parsers, verifiers, shortlist, resolveDecision, markdown builder) | nada                       |
| Integration / e2e mockeado | 4     | pipeline entero contra DB real con MSW interceptando OpenAI                  | `DATABASE_URL_TEST`        |
| E2E real                   | 1     | `numeric-fidelity` contra OpenAI real                                        | `OPENAI_API_KEY` real + DB |

### Tests anti-alucinación (diferencial del diseño)

El pain point detrás del challenge: **el LLM pierde contexto en ofertas largas y devuelve precios incorrectos**. Tres tests específicos verifican que la red de seguridad descrita en `CLAUDE.md` aguanta cuando el modelo se rompe.

#### T1 — Unit `resolve-decision` (offline)

```bash
pnpm test:unit src/core/reconcile/resolve-decision.test.ts
```

- **Archivo**: `src/core/reconcile/resolve-decision.test.ts`
- **Tiempo / costo**: <1s, sin I/O, sin red.
- **Requisitos**: ninguno. Corre en CI por default.
- **Qué prueba**: si el judge devuelve un `requestItemRef` que no estaba en la shortlist (alucinación pura), la línea se degrada a `relation=extra` + `lowConfidence=true`. Si el judge confía con `confidence ≥ TRUST_JUDGE_CONFIDENCE`, su veredicto sobrescribe a los verificadores; si no, la flag `lowConfidence` se preserva sin cambiar la `relation`.

#### T2 — Integration adversarial `reconcile-hallucination` (DB real + MSW)

```bash
pnpm test:e2e tests/e2e/reconcile-hallucination.e2e.ts
```

- **Archivo**: `tests/e2e/reconcile-hallucination.e2e.ts`
- **Tiempo / costo**: ~26s, $0. Mocks de OpenAI con MSW; DB MySQL de test (`DATABASE_URL_TEST`).
- **Requisitos**: `DATABASE_URL_TEST` apuntando a una DB local. Corre en CI.
- **Qué prueba** (3 escenarios sobre `case-simple`):
  - **Schema retry**: el primer intento devuelve JSON truncado; el reintento con feedback completa el batch y la oferta termina `RECONCILED`.
  - **HTTP 500 persistente**: el batch que falla degrada todos sus items a `extra+lowConfidence` con raw persistido, sin marcar la oferta entera como `FAILED`.
  - **`requestItemRef` alucinado**: la línea queda trazable vía `DecisionLog`; nunca llega un `MATCH` con `requestItemId=null` a DB.

#### T3 — E2E real `numeric-fidelity` (killer test, OpenAI real)

```bash
# OPENAI_API_KEY real en .env.test (fuera de git)
pnpm test:e2e tests/e2e/numeric-fidelity.e2e.ts
```

- **Archivo**: `tests/e2e/numeric-fidelity.e2e.ts`
- **Tiempo / costo**: ~4–5 min, ~$0.05 USD por corrida.
- **Requisitos**: `OPENAI_API_KEY` real (no `sk-dummy`) en `.env.test` + `DATABASE_URL_TEST`. Skip automático si la key es dummy. Manual o nightly, no corre en CI por default.
- **Qué prueba**: sube `oferta_mantenimiento_integral.pdf` (case-complex, ~220 items), corre el pipeline entero contra OpenAI real, re-lee el texto crudo del PDF y para cada `OfferItem` verifica que su `unitPrice` y `quantity` aparezcan como substring (en las variantes `1234`, `1.234,56`, `1,234.56`, etc.) en el texto fuente. Tolerancia ≤1% de miss por idiosincrasias de formato.

#### Qué garantiza la última corrida real

- **0 precios alucinados** en los >150 `OfferItem` extraídos (tasa de miss ≤1%).
- **0 `MATCH` huérfanos** con `requestItemId=null` llegando a DB.
- **Sum check exacto**: `match + partial + missing == 220` (cubrimos toda la solicitud sin doble-conteo).
- **Costo total** < $0.15 USD para 220 items.

Mocks de OpenAI con MSW. Fixtures de los escenarios en `fixtures/scenarios/`.

## Limitaciones y mejoras futuras

- **Pares semánticamente ambiguos**: una UI de revisión manual ("¿este par cuenta como match?") permitiría feedback al modelo en próximas corridas y recuperaría los pocos casos que el threshold conservador descarta.
- **Sin pgvector**: 220 vectores entran en RAM. Para catálogos >10k items habría que persistir embeddings.
- **Sin comparar múltiples ofertas**: el spec no lo pide. Sería una vista agregada por `PurchaseRequest` listando todas sus ofertas con un ranking de cobertura.
- **Sin Sentry/OTEL**: pino con logs JSON alcanza para el alcance del challenge.
- **Sin auth**: demo single-tenant.

## Convenciones

Conventional Branch + Conventional Commits con scope. Ver `CLAUDE.md` para reglas de estilo de código y workflow AI.

## Estructura

```
src/
  core/                       # lógica pura, sin I/O
    extract/                  # schemas Zod + helpers xlsx/pdf
    reconcile/                # algoritmo shortlist + verifiers
    output/                   # markdown builder determinista
  infra/
    db/                       # Prisma client
    extract/                  # pdf-service, xlsx-service
    ai/                       # OpenAI wrapper con token logging
    offer/                    # pipeline orquestador
    reconcile/                # reconcile-service + reverse-pass
  app/
    (dashboard)/              # UI
    api/
      health/                 # { status, db }
      version/                # { commit, node, bootedAt }
      ofertas/[id]/status/    # polling endpoint
scripts/
  seed.ts                     # CSV → DB idempotente
prisma/
specs/                        # specs internas por módulo
fixtures/scenarios/           # case-simple, case-complex
docs/
  benchmarks.md
  challenge.pdf
```

## Despliegue

Railway unified: app + MySQL en un solo proyecto. Push a `main` dispara deploy automático via `railway up`. Preview environment por PR.
