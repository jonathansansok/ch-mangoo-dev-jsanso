# CLAUDE.md

Notas internas del proyecto. Decisiones, contexto y convenciones que conviene tener a mano.

## Qué es esto

Challenge técnico de Esolbay. Procesar una oferta de proveedor (PDF o XLSX), modelarla, y conciliarla contra solicitudes de compra cargadas en DB. La oferta no comparte IDs con la solicitud ni copia las descripciones, así que la conciliación es semántica.

Criterio de evaluación citado en el spec (página 3):

> Preferimos una solución simple que funcione bien y permita discutir decisiones reales antes que una arquitectura grande sin valor claro.

Pragmático antes que vistoso.

## Estado del repo

Por ahora solo el spec (`docs/challenge.pdf`) y los datos de los escenarios (`fixtures/scenarios/`). Stack y código todavía no existen. Las decisiones macro están en `specs/00-overview.md`.

Resultados medidos contra `reconciliation_guide.md` de cada escenario: ver `docs/benchmarks.md`. Cobertura actual: 100% case-simple, 99.4% PDF complex, 99.1% XLSX complex.

## Entregables que pide el spec

- Seed inicial de DB desde los CSVs. La importación CSV no es feature runtime, es solo seed.
- Ingesta de oferta PDF/XLSX con extracción AI.
- Persistir oferta parseada + resultado de conciliación.
- Tabla conciliada con relación (match, parcial, faltante, sobrante), diferencias y rationale corto.
- Vista de oferta + tabla + resumen Markdown para comprador + trazabilidad de cada decisión.
- UI es opcional. CLI, API o Markdown alcanzan. En este proyecto va con UI Next.

## Escenarios

Dos casos en `fixtures/scenarios/`:

- `case-simple/`: 6 items, 2 ofertas (PDF + XLSX). Valida flujo end-to-end.
- `case-complex/`: 220 items, 2 ofertas. Stress de volumen y matching semántico.

Cada uno trae `purchase_requests.csv`, `purchase_request_items.csv`, `offers/` y `reconciliation_guide.md`. La guía es referencia humana para validar a ojo. **La app no la lee como input**, el spec lo aclara en la página 1.

## Notas de dominio

- Las ofertas usan vocabulario del proveedor, no el del comprador. Ejemplos reales de los datos: `Boligrafo azul` ↔ `Lapicera tinta azul punta media`, `Cable unipolar 1.5mm2 rojo` ↔ `Conductor flexible 1.5 mm2 rojo`, `Canaleta PVC` ↔ `Ducto polipropileno pasacable`. Fuzzy match puro no alcanza, hace falta similaridad semántica o judgment del LLM.
- Relaciones que aparecen en los guides: `match`, `partial_quantity`, `missing_from_offer`, `extra`. Es vocabulario de partida, no enum cerrado.
- El código de proveedor (`SIP-00110`, `OFN-00110`) no es el `item_id` de la solicitud. No correlacionan.
- Cantidades pueden diferir y eso es información, no error.

## Diseño del pipeline contra context loss

En la entrevista técnica surgió que el problema actual del equipo es que **OpenAI pierde contexto en ofertas largas** y devuelve precios incorrectos al cliente. El pipeline está pensado para mitigar eso.

1. El LLM no es source-of-truth de números. Precios, qty, totales viven en DB tras la extracción. Outputs posteriores devuelven IDs y rationale corto. La UI y el Markdown hidratan desde DB.
2. Outputs referenciales, no narrativos. Reconciliación devuelve `{ request_item_id, relation, confidence, rationale_short }`. Sin repetir descripciones ni precios.
3. Una llamada, una responsabilidad. Prompts separados para header, items y batch de reconciliación. Sin mega-prompt.
4. Batches chicos y autocontenidos. Lotes de ≤10 offer items con su shortlist adentro. Sin estado entre llamadas.
5. Schema-first con Zod. Si el LLM rompe el schema, reintento con feedback (máx 2), después fallback: línea con `relation=extra, lowConfidence=true` y raw persistido.
6. Grounding por embeddings. Shortlist con coseno antes del judge. El modelo elige entre candidatos pre-filtrados, no "recuerda" la solicitud entera.
7. Streaming es UX, no fix de contexto. Sirve para feedback visual, no soluciona context loss. La solución real son las reglas 1-6.
8. Cache por hash. `sha256(file)` como key. Mismo archivo no re-llama al LLM.
9. DecisionLog por llamada. Persistir model, tokens, costo, prompt, raw, candidatos, decisión, rationale, duración.
10. Verificadores deterministas post-LLM. Similaridad mínima ≥ 0.65, qty dentro de rango razonable, unidades compatibles tras normalización. Si fallan y el judge no tiene alta confianza, la línea se marca con `lowConfidence=true` pero conserva su `relation` original — la baja confianza es un flag, no una relación (la consigna del challenge define 4 relaciones).

## Volumen

Case-complex tiene 220 items. O(n·m) calls al LLM es inviable. La estrategia es:

1. Embed items pedidos una vez, cachear por request_id.
2. Embed items ofertados.
3. Por cada offer item, top-5 candidatos por coseno (in-memory, sin pgvector).
4. Judge en batches de ≤10 contra su shortlist. Devuelve match o `extra`.
5. Reverse pass: items pedidos sin asignar → `missing_from_offer`.

Costo estimado case-complex ~$0.10 USD con `gpt-4o-mini`.

## Trabajo en el repo

- Spec, datos y guides están en español. La salida al usuario (Markdown, UI) también va en español. Código e identificadores en inglés.
- El `README.md` cubre quickstart, decisiones técnicas y modelo de datos (lo exige el spec en la página 2).

## Railway deploy

App live en Railway con auto-deploy desde `main`. Apuntes de la infra actual:

- **`railway.json`**: el `startCommand` corre `prisma migrate deploy && pnpm db:seed && pnpm start`. Sin eso la DB queda vacía y `/home` rompe con `Prisma P2021`.
- **Builder**: Railway está usando Railpack 0.23.0, no Nixpacks. `nixpacks.toml` queda ignorado; la customización del start vive en `railway.json`.
- **Plugin MySQL**: expone `MYSQL_URL`, no `DATABASE_URL`. En el service app, `DATABASE_URL` es una referencia: `${{MySQL.MYSQL_URL}}`.
- **NODE_ENV**: tiene que ir en lowercase (`production`); el schema Zod en `src/env.ts` rechaza uppercase.
- **Servicio Railway** se llama `innovative-reflection` (no `app`). Lo referencia `.github/workflows/deploy.yml`.
- **Healthcheck**: `/api/health` con timeout 120s en `railway.json`. Si la ruta cambia o el endpoint rompe, los deploys quedan en failed aunque la app responda.

## Convención de ramas y commits

Híbrido: Conventional Branch para ramas + Conventional Commits con scope para mensajes.

**Ramas**: `<type>/<kebab-description>`. Tipos: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`, `revert`, `hotfix`, `release`.

```
feat/seed-csv-import
feat/reconcile-embedding-shortlist
fix/csv-utf8-bom
chore/setup-docker-compose
docs/spec-overview
ci/github-actions-pipeline
```

**Commits**: `<type>(<scope>): <descripción imperativa>`. Scopes del proyecto: `seed`, `db`, `extract`, `reconcile`, `ai`, `ui`, `api`, `infra`, `ci`, `deps`, `docs`.

```
feat(reconcile): add cosine top-k shortlist before llm judge
feat(extract): parse xlsx offer with sheetjs
fix(seed): handle bom in csv reader
chore(deps): bump prisma to 5.20
```

Subject ≤72 chars, imperativo, sin emojis.

Flujo: `main` protegida, una rama corta por feature, PR con squash merge, borrar rama post-merge. `commitlint` + `husky` validan formato.

## Checklist obligatorio del entregable

### Setup del proyecto

- [ ] `.editorconfig` (indent 2, LF, trim trailing, final newline).
- [ ] `.nvmrc` con Node 20 o 22 LTS + `"engines"` en `package.json`.
- [ ] `.env.example` con todas las vars sin valores.
- [ ] `tsconfig.json` estricto: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- [ ] ESLint flat config (`eslint.config.mjs`).
- [ ] Prettier (`.prettierrc`, `.prettierignore`).
- [ ] Husky pre-commit con `lint-staged`.
- [ ] Husky commit-msg con `commitlint`.
- [ ] Validación de env con Zod (`src/env.ts`) que falle al boot si faltan vars críticas.

### Infra

- [ ] `docker-compose.yml` con MySQL 8 + healthcheck + volumen nombrado.
- [ ] Migraciones Prisma versionadas (`prisma migrate`, no `db push`).
- [ ] Seed idempotente con `upsert`.
- [ ] `/api/health` devuelve `{ status: "ok", db: "ok" }`.
- [ ] `/api/version` devuelve commit SHA.

### Workflow AI

- [ ] Wrapper OpenAI con logging de tokens (model, prompt, completion, costo estimado).
- [ ] Reintentos con backoff (`p-retry`).
- [ ] Output del LLM validado con Zod, reintento con feedback si rompe.
- [ ] `ExtractionCache` por hash sha256 del archivo.
- [ ] Trazabilidad: prompt + raw + decisión por cada `ReconciliationLine`.
- [ ] `MAX_TOKENS_PER_RUN` como env var.
- [ ] `import 'server-only'` en archivos con API key.

### Calidad

- [ ] Logs con `pino` (pretty en dev, JSON en prod).
- [ ] `error.tsx`, `loading.tsx`, `not-found.tsx` donde corresponda.
- [ ] Unitarios Vitest para `core/reconcile`, parsers, mappers.
- [ ] Al menos 1 e2e por escenario contra DB de test.
- [ ] Tipos compartidos vía `z.infer<>` o `Prisma.GetPayload<>`. Sin duplicar shapes.

### CI y GitHub

- [ ] `.github/workflows/ci.yml`: `lint`, `typecheck`, `test`, `build` en paralelo. Cache pnpm + `.next/cache`.
- [ ] `commitlint` en CI también.
- [ ] `.github/dependabot.yml` semanal.
- [ ] `.github/pull_request_template.md`.
- [ ] Railway preview environments en cada PR.
- [ ] `railway.json` o `nixpacks.toml` versionado.
- [ ] Secret `RAILWAY_TOKEN` configurado en GitHub para deploy.
- [ ] Badges en README: CI, Railway deploy, Node version.

### README

- [ ] Stack + decisiones técnicas con su razón.
- [ ] Quickstart: `cp .env.example .env.local && pnpm install && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev`.
- [ ] Cómo procesar una oferta (con screenshots si va por UI).
- [ ] Modelo de datos (ASCII o link a `prisma/schema.prisma`).
- [ ] Estrategia de extracción PDF/XLSX.
- [ ] Estrategia de conciliación + manejo de volumen.
- [ ] Estrategia de trazabilidad.
- [ ] Limitaciones y mejoras futuras.

## Spec-Driven Development

Cada módulo arranca con una spec corta en `specs/`: inputs, outputs, casos de borde y criterios de aceptación. La spec se revisa antes de empezar a codear el módulo.

Specs planificadas:

```
00-overview.md              objetivo, stack, decisiones macro
01-data-model.md            entidades Prisma, relaciones, invariantes
02-seed.md                  CSV → DB, idempotencia, comando
03-extract-pdf.md           pipeline PDF, prompt, schema salida
04-extract-xlsx.md          sheetjs → normalización → LLM si hace falta
05-reconcile.md             embeddings shortlist + LLM judge + clasificación
06-output-markdown.md       estructura del resumen para comprador
07-traceability.md          DecisionLog, qué se loguea y cómo se consulta
08-api-and-ui.md            rutas Next, server actions, páginas
09-testing-strategy.md      unitarios, e2e, fixtures, mocks de OpenAI
10-ci-cd.md                 workflows, secrets, Railway preview, deploy
```
