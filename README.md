# challenge-ok

[![CI](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/ci.yml/badge.svg)](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/ci.yml)
[![Deploy](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/deploy.yml/badge.svg)](https://github.com/jonathansansok/ch-mangoo-dev-jsanso/actions/workflows/deploy.yml)
![Node](https://img.shields.io/badge/node-22%2B-339933?logo=node.js&logoColor=white)

Procesa ofertas de proveedor (PDF/XLSX) y las concilia contra solicitudes de compra cargadas en DB. La oferta no comparte IDs con la solicitud ni copia las descripciones, así que la conciliación es semántica.

Challenge técnico de Esolbay. El spec completo está en `docs/challenge.pdf` y los datos de prueba en `fixtures/scenarios/`.

## Resultados

Medido contra el `reconciliation_guide.md` de cada escenario (ver `docs/benchmarks.md`):

| Escenario         | Cobertura       | Costo   | Tiempo |
| ----------------- | --------------- | ------- | ------ |
| case-simple PDF   | 100% (5/5)      | $0.0005 | ~30s   |
| case-simple XLSX  | 100% (7/7)      | $0.0003 | ~10s   |
| case-complex PDF  | 99.4% (171/172) | $0.052  | 324s   |
| case-complex XLSX | 99.1% (218/220) | $0.064  | 68s    |

Los pares no recuperados (`Bandeja↔Cubeta pintura`, `Pinza universal↔combinada`) son ambiguos a propósito: el judge prefiere quedarse en `missing+extra` antes que asumir un match incorrecto. Bajar `REVERSE_PASS_MIN_CONFIDENCE` los recupera pero abre falsos positivos peores (`Llave francesa↔Llave de paso`).

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

### Procesar una oferta

1. Ir a `Ofertas → Subir`
2. Elegir la solicitud destino (seed crea `REQ-OFI-2026-001` y `REQ-MOP-2026-001`)
3. Subir un PDF o XLSX de `fixtures/scenarios/*/offers/`
4. El pipeline corre en background. La página de detalle hace polling y muestra:
   - Header extraído (proveedor, fecha, observaciones)
   - Tabla de items ofertados con precios y cantidades
   - Tabla conciliada (match / parcial / missing / extra / low_confidence) con rationale
   - Markdown descargable para el comprador

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

- `Offer.status` es máquina de estados: `PENDING → EXTRACTING → EXTRACTED → RECONCILING → RECONCILED | FAILED`.
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
4. **Verificadores post-LLM**. Si la similaridad embedding cae bajo `MIN_SIMILARITY=0.55` y la confianza del judge bajo `TRUST_JUDGE_CONFIDENCE=0.7`, downgrade automático a `low_confidence`. Qty fuera de rango `[0.1×, 3×]` añade flag `quantity_anomaly`.
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

| Var                           | Default      | Efecto                                                     |
| ----------------------------- | ------------ | ---------------------------------------------------------- |
| `SHORTLIST_K`                 | 10           | Top-K candidatos por offer item para forward judge         |
| `JUDGE_BATCH_SIZE`            | 10           | Items por batch al judge                                   |
| `MIN_SIMILARITY`              | 0.55         | Verificador post-judge para downgrade a low_confidence     |
| `TRUST_JUDGE_CONFIDENCE`      | 0.7          | Si confianza del judge ≥ esto, no downgrade por similarity |
| `REVERSE_PASS_K`              | 8            | Top-K extras candidatos para cada unassigned request       |
| `REVERSE_PASS_MIN_CONFIDENCE` | 0.7          | Confianza mínima para aceptar recovery                     |
| `QTY_RATIO_MIN/MAX`           | 0.1 / 3.0    | Rango aceptable de cantidad ofertada vs pedida             |
| `MAX_TOKENS_PER_RUN`          | 100000       | Budget guard por pipeline                                  |
| `EXTRACT_MODEL`               | gpt-4o-mini  | Modelo para extracción                                     |
| `JUDGE_MODEL`                 | gpt-4.1-mini | Modelo para forward judge y reverse pass                   |

## Testing

```bash
pnpm test            # unit + integration
pnpm test:unit       # solo unit (src/)
pnpm test:integration
pnpm typecheck
pnpm lint
```

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
