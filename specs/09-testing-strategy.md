# Spec 09 — Estrategia de testing

## Objetivo

Cobertura focalizada en la lógica que importa: extracción, conciliación, builder Markdown, wrapper AI. UI con tests mínimos. Cero ceremonia, cero tests triviales.

## Pirámide

```
       /\
      /e2e\          ~3 tests: pipeline entero contra fixtures reales
     /------\
    / integ. \       ~15 tests: DB real, OpenAI mockeado, server actions
   /----------\
  /   unit     \     ~40 tests: funciones puras del core
 /--------------\
```

Mayoría unit. Pocos e2e por costo (OpenAI key + tiempo). Integration para puentes DB + lógica.

## Herramientas

- **Vitest** runner principal.
- **happy-dom** environment para componentes React si surge la necesidad.
- **@testing-library/react** para tests de componentes con interacción.
- **prisma** schema reusado con DB de test (Docker MySQL puerto distinto o schema distinto).
- **MSW** para interceptar HTTP a OpenAI en integration.
- **`vi.mock`** para mocks de módulos en unit.
- **Playwright** para e2e completo opcional (sólo si sobra tiempo, no es obligatorio).

## Categorías

### Unit (sin I/O)

Foco: lógica pura, deterministas, < 10ms cada uno.

**Casos**:

- `core/reconcile/cosine.ts`: producto coseno entre vectores conocidos.
- `core/reconcile/shortlist.ts`: dados embeddings sintéticos, top-K correcto y ordenado.
- `core/reconcile/verifiers.ts`: cada verificador (similarity, qty range, unit compat) con casos boundary.
- `core/reconcile/conflict-resolution.ts`: dos offer items matchean el mismo request → conserva el de mayor confidence.
- `core/output/markdown-builder.ts`: snapshot tests por sección + completo.
- `core/output/filename.ts`: slugify de nombres con acentos y caracteres especiales.
- `lib/parse-money.ts`: ARS/USD/sin moneda, separadores coma/punto.
- `lib/parse-decimal.ts`: enteros, decimales con coma, con punto, casos inválidos.
- `lib/normalize-text.ts`: lowercase + strip accents + colapsar espacios + sinónimos de unidades.
- `lib/openai-pricing.ts`: estimar costo de modelos conocidos y desconocidos.
- `lib/format.ts`: `Intl.NumberFormat` y `DateTimeFormat` en es-AR.
- `infra/extractors/xlsx-column-mapping.ts`: heurística de matching de headers.

### Integration (con I/O controlado)

DB real (test instance), OpenAI mockeado con MSW.

**Setup**: `vitest.setup.ts` arranca antes de cada archivo:

```ts
beforeAll(async () => {
  await prisma.$executeRaw`...`; // ensure clean state
});

beforeEach(async () => {
  // truncate en orden: reconciliationLine, decisionLog, reconciliation, offerItem, offer, purchaseRequestItem, purchaseRequest, extractionCache
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

**Casos**:

- **Seed**:
  - `seed --reset` deja exactamente 2 requests + 226 items.
  - Re-correr seed no duplica.
  - CSV con BOM no rompe.
  - CSV con fila inválida → exit code distinto de 0.

- **OpenAI wrapper**:
  - `callLLM` persiste `DecisionLog` con todos los campos.
  - `estimateCost` calcula correcto.
  - Reintentos con backoff cuando MSW devuelve 429.
  - Schema retry cuando MSW devuelve JSON inválido la primera vez y válido la segunda.

- **Extracción PDF**:
  - Cache hit: subir mismo hash dos veces, segunda no llama al LLM (verificar count de DecisionLog).
  - Schema retry: MSW devuelve raw inválido 2 veces, válido al 3er intento → 2 entries en DecisionLog + 1 ofertaExtracted.
  - Schema fail definitivo: Offer.status = FAILED con razón.

- **Extracción XLSX**:
  - Camino A puro: fixture con headers limpios → 0 calls al LLM, items extraídos.
  - Camino B: headers raros → 1 call de mapping + 1 de header.

- **Reconcile**:
  - case-simple end-to-end con OpenAI mockeado (respuestas deterministas via MSW). Asserts del conteo y de las relaciones.
  - Reverse pass: request items no asignados → `MISSING_FROM_OFFER` automáticos.
  - Verifier downgrade: similarity 0.5 + match LLM → línea queda `LOW_CONFIDENCE`.
  - Idempotency: re-conciliar sin `force=true` no hace nada.

- **Server actions**:
  - `uploadOffer` crea Offer y dispara pipeline (verificar status pasa por EXTRACTING → EXTRACTED → RECONCILING → RECONCILED).
  - `uploadOffer` rechaza archivo > 10MB.
  - `regenerateSummary` actualiza `Reconciliation.summary`.

- **Route handlers**:
  - `GET /api/health` 200 ok con DB sana.
  - `GET /api/health` 503 con DB caída (mock prisma throws).
  - `GET /api/ofertas/[id]/summary` devuelve 404 si no hay reconciliation, 200 con .md si sí.

### E2E con OpenAI real

Marcadas con `test.skipIf(!process.env.OPENAI_API_KEY)`. Corren solo en CI con el secret seteado.

**Casos**:

1. `case-simple end-to-end real`: cargar fixtures, subir `oferta_oficenter_norte.xlsx`, esperar status `RECONCILED`, verificar:
   - ≥ 5 lines con `match` o `partial_quantity`.
   - 0 `missing_from_offer`.
   - 1 `extra`.
   - `Reconciliation.summary` populado y no vacío.

2. `case-complex end-to-end real`: subir `oferta_suministros_industriales.xlsx`, esperar `RECONCILED`, verificar:
   - ≥ 200 lines con `match` o `partial_quantity`.
   - Tiempo total < 60s.
   - `totalCostUsd` < $0.05.

3. `case-complex PDF end-to-end real`: subir `oferta_mantenimiento_integral.pdf` y esperar resultado coherente.

Estos 3 tests se corren una vez por release, no en cada PR (costo y tiempo). Trigger manual en CI o nightly.

## Configuración

### `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',                  // aislar tests con DB
    poolOptions: { forks: { singleFork: true } },
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/lib/**', 'src/infra/**'],
      exclude: ['**/*.d.ts', '**/types.ts'],
      reporter: ['text', 'html'],
    },
    testTimeout: 20_000,            // generoso para integration
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### Test DB

Opción A (preferida): `docker-compose.yml` con segundo servicio MySQL en puerto distinto.

```yaml
services:
  mysql:
    image: mysql:8
    ports: ['3306:3306']
    environment: { ... }
  mysql-test:
    image: mysql:8
    ports: ['3307:3306']
    environment: { ... }
```

`DATABASE_URL_TEST` apunta a `mysql://...@localhost:3307/...`. Tests cargan `dotenv` con `.env.test`.

Opción B (más liviana): usar el mismo servicio y crear schema `oferta_test`. `DATABASE_URL_TEST` con el schema. Más rápido de arrancar.

Decisión: **Opción B**. Un solo MySQL, dos schemas (`oferta` y `oferta_test`). En CI también un solo service container.

### Mocks de OpenAI

MSW handler en `tests/mocks/openai.ts`:

```ts
import { http, HttpResponse } from 'msw';

export const openaiHandlers = [
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json(mockChatResponse());
  }),
  http.post('https://api.openai.com/v1/embeddings', () => {
    return HttpResponse.json(mockEmbeddingResponse());
  }),
];
```

Fixtures de respuestas en `tests/fixtures/openai/`. Cada test puede overridear el handler para casos específicos (schema roto, rate limit, etc).

### Seed de fixtures para tests

`tests/helpers/seed.ts`:

```ts
export async function seedCaseSimple() {
  await prisma.purchaseRequest.create({ data: { externalId: 'REQ-OFI-2026-001', title: '...', items: { create: [...] } } });
}
```

Reusable en cualquier test que necesite request items.

## CI

`.github/workflows/ci.yml` levanta MySQL service container:

```yaml
services:
  mysql:
    image: mysql:8.0
    env:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: oferta_test
    ports: ['3306:3306']
    options: >-
      --health-cmd="mysqladmin ping -h localhost"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=5
```

Jobs:

```yaml
jobs:
  lint:      runs eslint + prettier check
  typecheck: runs tsc --noEmit
  test:      runs vitest (unit + integration)
  build:     runs next build
  test-e2e:  runs vitest --grep "e2e" with OPENAI_API_KEY secret (manual trigger)
```

Cache: `pnpm-lock.yaml` hash + `.next/cache`.

## Coverage

Sin umbrales hard en CI. Tests forzados por umbral terminan siendo tests basura.

Target informativo: ≥ 80% en `src/core/`. UI y server actions no se miden con coverage.

## Patrones a evitar

- Tests que mockean Prisma. Si necesita Prisma, va a integration con DB real.
- Tests que solo verifican que un método existe.
- Snapshots de payloads gigantes sin razón. Usar snapshots solo donde la salida estable lo justifica (markdown builder, prompts del LLM).
- Tests con `setTimeout` y `sleep`. Usar `vi.useFakeTimers` si se requiere control de tiempo.
- Tests que dependen del orden de ejecución de otros tests.

## Helpers compartidos

```
tests/
  helpers/
    db.ts                 # truncateAll, createTestPrisma
    seed.ts               # seedCaseSimple, seedCaseComplex
    mocks/
      openai.ts           # MSW handlers + factory de responses
  fixtures/
    openai/               # responses canónicas
    csv/                  # CSV malformados, con BOM, etc
    pdf/                  # PDFs sintéticos chicos
    xlsx/                 # XLSX con distintas estructuras
    markdown/             # expected outputs del builder
```

## Comandos

```
pnpm test              # unit + integration (default)
pnpm test:watch        # watch mode
pnpm test:unit         # solo unit (--grep "^unit:")
pnpm test:integration  # solo integration
pnpm test:e2e          # solo e2e (requiere OPENAI_API_KEY)
pnpm test:coverage     # con reporte de coverage
```

Convención de nombres de archivo:

```
*.test.ts          unit
*.integration.ts   integration (DB + MSW)
*.e2e.ts           e2e con OpenAI real
```

`vitest.config.ts` filtra por glob según el comando.

## Criterios de aceptación

- `pnpm test` corre en < 30s en local y CI.
- Cero tests flaky (que pasen una vez y fallen otra sin cambios).
- DB de test se resetea entre archivos (no entre tests si compartimos seed dentro del mismo archivo, por performance).
- E2E con OpenAI real corre solo cuando se le pasa el secret.
- CI rojo si algún test falla.

## Out of scope

- Tests de carga (k6, artillery). Mejora futura.
- Visual regression (Percy, Chromatic).
- Mutation testing (Stryker).
- Tests de accesibilidad automatizados (axe-core). Se valida manual con Lighthouse en QA.

## Próximo

- `10-ci-cd.md`: pipeline completo de GitHub Actions + Railway deploy.
