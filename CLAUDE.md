# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This repo currently holds only the challenge spec (`docs/challenge.pdf`) and scenario inputs under `fixtures/scenarios/`. No application code exists yet — implementation language, framework, and DB are open decisions. Update this file with concrete build/test/run commands once a stack is chosen.

## What this project is

Technical challenge from **Esolbay** (Spanish, Argentinian procurement domain): build an app that processes a supplier offer (PDF or XLSX), models it, and reconciles its items against purchase requests already loaded in a database — **without shared IDs and without identical descriptions**. Reconciliation is semantic.

Evaluation criterion from the spec (page 3): *"Preferimos una solución simple que funcione bien y permita discutir decisiones reales antes que una arquitectura grande sin valor claro."* Pragmatic > architecturally impressive.

## Required deliverables (from `docs/challenge.pdf`)

- **DB seed**: load purchase requests + items from CSVs at startup. CSV import is *not* a runtime feature of the app — it's a seed/migration concern only.
- **Offer ingestion**: accept PDF and XLSX, extract structured data via AI (supplier, items, qty, price, observations).
- **Persistence**: store both the parsed offer and the reconciliation result.
- **Reconciliation output**: per offered item, indicate which requested item it matches (or none), with relation type (clear match, partial, missing, extra), differences (e.g. qty), and a short rationale.
- **Output**: parsed offer view + reconciled item table + Markdown summary for a buyer + traceability of what the AI extracted and why each decision was made.
- UI is optional — CLI, API, generated HTML/Markdown, or readable JSON are all acceptable.

## Scenarios (`fixtures/scenarios/`)

Two test cases, each self-contained:

| Folder | Items | Offers | Purpose |
|---|---|---|---|
| `case-simple/` | 6 | 2 (1 PDF, 1 XLSX) | Validate end-to-end flow |
| `case-complex/` | 220 | 2 (1 PDF, 1 XLSX) | Stress volume + semantic matching |

Each scenario contains:
- `purchase_requests.csv` — request header (`request_id`, `title`)
- `purchase_request_items.csv` — line items (`request_id`, `item_id`, `description`, `quantity`, `unit`)
- `offers/` — supplier offers in PDF and XLSX
- `reconciliation_guide.md` — **human-only validation reference**. Lists expected matches (match / partial_quantity / missing_from_offer / extra) with rationale. **The app must NOT read this file as input** (spec is explicit on this — page 1, "Importante" callout). Use it only to check your output by eye.

## Reconciliation domain notes (gathered from the guides)

- Offers use supplier vocabulary, not the requester's wording. E.g. `Boligrafo azul` (request) ↔ `Lapicera tinta azul punta media` (offer); `Cable unipolar 1.5mm2 rojo` ↔ `Conductor flexible 1.5 mm2 rojo`; `Canaleta PVC` ↔ `Ducto polipropileno pasacable`. Pure string/fuzzy match will miss these — semantic similarity (embeddings) or LLM judgment is the intended approach.
- Relation kinds seen in the guides: `match`, `partial_quantity` (qty offered < or > requested), `missing_from_offer` (requested but not offered), `extra` (offered but not requested). Treat as a starting vocabulary, not a closed enum the spec mandates.
- Offers carry a supplier-internal code (e.g. `SIP-00110`, `OFN-00110`) — this is *not* the request's `item_id` and must not be assumed to correlate.
- Quantities may differ (partial fulfilment is a real outcome, not an error). Preserve both numbers in the output.

## Volume consideration

`case-complex` has 220 requested items vs. an offer of similar size. A naive O(n·m) LLM call per pair won't scale or be cheap. Reasonable approaches: embed-and-shortlist (vector top-k) + LLM verification on candidates, or a single batched LLM call with both lists. Whatever is chosen, the design discussion is part of the evaluation — make the strategy explicit in the project README.

## Working in this repo

- Spec, scenario data, and reconciliation guides are in **Spanish**. Keep user-facing output (Markdown summaries) in Spanish; code/identifiers can stay English.
- When implementation begins, add a short `README.md` (or extend this file) covering: stack choice, how to seed DB, how to run extraction on one offer, how to view output. Spec entregables (page 2) require this.
- Do not invent commands here that don't exist yet. Update this section after the first runnable version.

## Estilo de código (regla del autor)

Este es un challenge entregable a evaluadores. El código debe verse escrito por una persona, no por un asistente.

- **Comentarios: pocos y certeros.** Solo cuando el *por qué* no es obvio: invariantes ocultos, workarounds puntuales, decisiones contraintuitivas. Si el nombre de la función ya lo dice, no comentar.
- **No narrar el qué.** Nada de `// itera sobre items y los suma`, `// función que valida X`, `// helper para Y`.
- **No firmar AI.** Sin emojis en código, sin headers ASCII, sin `🤖`/`✨`, sin frases como "this elegant solution", "robust implementation", "comprehensive". Sin `Co-Authored-By: Claude` en commits.
- **No docstrings inflados.** Una línea si hace falta. No JSDoc multi-párrafo en funciones triviales.
- **No defensive coding gratuito.** No `try/catch` que solo re-lanza, no validación de parámetros internos confiables, no chequeos de `null` cuando el tipo ya lo prohíbe. Validar solo en bordes (input usuario, archivos, API externa).
- **Manejo de errores realista.** Errores específicos donde importa, sin envoltorios genéricos `Error("something went wrong")`.
- **Commits humanos.** Modo imperativo, sin pie de Claude, sin `Co-Authored-By`.
- **Sin TODO/FIXME huérfanos** del tipo "implementar después". Si no se hace, no se escribe.
- **Nombres idiomáticos del stack**, no verbosos. `parseOffer` mejor que `parseAndExtractSupplierOfferFromFile`.

## Convención de ramas y commits

**Ramas: Conventional Branch** — `<type>/<kebab-description>`

Tipos válidos: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `ci`, `build`, `revert`, `hotfix`, `release`.

Ejemplos:
```
feat/seed-csv-import
feat/extract-pdf-offer
feat/reconcile-embedding-shortlist
fix/csv-utf8-bom
chore/setup-docker-compose
docs/readme-instructions
ci/github-actions-pipeline
```

**Commits: Conventional Commits con scope** — `<type>(<scope>): <descripción imperativa>`

Scopes del proyecto: `seed`, `db`, `extract`, `reconcile`, `ai`, `ui`, `api`, `infra`, `ci`, `deps`, `docs`.

Ejemplos válidos:
```
feat(reconcile): add cosine top-k shortlist before llm verify
feat(extract): parse xlsx offer with sheetjs
fix(seed): handle bom in csv reader
chore(deps): bump prisma to 5.20
docs(readme): add docker-compose setup section
ci: add typecheck job to pipeline
```

Sin emojis, sin `Co-Authored-By: Claude`, sin firmas AI. Máximo 72 chars en el subject.

**Flujo**:
1. `main` protegida → deploy auto a Vercel.
2. Branch corta por feature/fix desde `main`.
3. Commits chicos y descriptivos dentro de la rama.
4. PR → squash merge a `main` (mensaje del squash = título de la PR, también Conventional Commit).
5. Borrar rama post-merge.

`commitlint` + `husky` para validar formato en local + CI.

## Checklist obligatorio antes de cerrar entregable

### Configuración del proyecto

- [ ] `.editorconfig` con `indent_size=2`, `end_of_line=lf`, `trim_trailing_whitespace=true`, `insert_final_newline=true`.
- [ ] `.nvmrc` con `20` o `22` LTS + `"engines": { "node": ">=20" }` en `package.json`.
- [ ] `.env.example` commiteado con todas las vars sin valores reales (`OPENAI_API_KEY=`, `DATABASE_URL=`).
- [ ] `tsconfig.json` estricto: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- [ ] ESLint flat config (`eslint.config.mjs`).
- [ ] Prettier configurado (`.prettierrc`, `.prettierignore`).
- [ ] Husky pre-commit corre `lint-staged` (lint + format en archivos staged).
- [ ] Husky commit-msg corre `commitlint` (valida Conventional Commit).
- [ ] Path alias `@/` confirmado en `tsconfig.json` y `vitest.config.ts`.
- [ ] Validación de env con Zod (`src/env.ts`) — boot falla si falta `OPENAI_API_KEY` o `DATABASE_URL`.

### Infra

- [ ] `docker-compose.yml` con MySQL 8, healthcheck, volumen nombrado.
- [ ] Prisma schema versionado, migraciones con `prisma migrate`, no `db push`.
- [ ] Seed idempotente con `upsert`.
- [ ] Health endpoint `/api/health` → `{ status: "ok", db: "ok" }`.
- [ ] Version endpoint `/api/version` → commit SHA desde `VERCEL_GIT_COMMIT_SHA`.

### Workflow AI específico

- [ ] Wrapper de cliente OpenAI con logging de tokens (model, prompt_tokens, completion_tokens, cost_usd estimado).
- [ ] Reintentos con backoff exponencial (`p-retry`) en llamadas OpenAI.
- [ ] Validación dura del output del LLM con Zod; reintento con feedback si schema roto.
- [ ] Hash del archivo input → cache de extracción (tabla `ExtractionCache`). No re-procesar mismo archivo.
- [ ] Persistir prompt usado + raw response + decisión final por cada `ReconciliationLine` (trazabilidad exigida por spec).
- [ ] Budget guard `MAX_TOKENS_PER_RUN` env var.
- [ ] Archivos que tocan API key marcados con `import 'server-only'`.

### Calidad

- [ ] Logging estructurado con `pino` (pretty en dev, JSON en prod).
- [ ] `error.tsx`, `loading.tsx`, `not-found.tsx` en App Router donde aplique.
- [ ] Vitest unitarios para `core/reconcile`, parsers, mappers.
- [ ] Al menos 1 e2e por escenario corriendo el flujo entero contra DB de test.
- [ ] Tipos compartidos: `z.infer<>` o `Prisma.GetPayload<>`. No duplicar shapes.

### GitHub / CI

- [ ] `.github/workflows/ci.yml` con jobs paralelos: `lint`, `typecheck`, `test`, `build`. Cache pnpm + `.next/cache`.
- [ ] `commitlint` también corre en CI.
- [ ] `.github/dependabot.yml` semanal para `npm` + `github-actions`.
- [ ] `.github/pull_request_template.md` con checklist (tests, docs, screenshots si UI).
- [ ] Vercel preview deploys conectados al repo (link bot en cada PR).
- [ ] README badges: CI status, Vercel deploy, Node version.

### README (entregable)

- [ ] Stack + decisiones técnicas con razones.
- [ ] Quickstart: `cp .env.example .env.local` → `pnpm install` → `docker compose up -d` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev`.
- [ ] Cómo procesar una oferta: comando o flujo UI con screenshots.
- [ ] Modelo de datos (diagrama ASCII o link a `prisma/schema.prisma`).
- [ ] Estrategia de extracción PDF/XLSX.
- [ ] Estrategia de conciliación semántica + manejo de volumen (220 ítems).
- [ ] Estrategia de trazabilidad.
- [ ] Mejoras futuras (Sentry, observabilidad, RAG, eval suite, etc).
- [ ] Limitaciones conocidas.

## Spec-Driven Development

Antes de codear cada módulo, escribir una spec corta en `specs/` y validarla con el usuario.

Especificaciones planificadas:

```
specs/
  00-overview.md              # objetivo, stack, decisiones macro
  01-data-model.md            # entidades, relaciones, invariantes
  02-seed.md                  # CSV → DB, idempotencia, comando
  03-extract-pdf.md           # estrategia PDF, prompt, schema Zod salida
  04-extract-xlsx.md          # sheetjs → normalización → LLM si hace falta
  05-reconcile.md             # algoritmo: embeddings shortlist + LLM judge, scoring, clasificación
  06-output-markdown.md       # estructura del resumen para comprador
  07-traceability.md          # qué se loguea, dónde, cómo se lee
  08-api-and-ui.md            # rutas Next, server actions, páginas
  09-testing-strategy.md      # unitarios, e2e, fixtures, mocks de OpenAI
  10-ci-cd.md                 # jobs, secrets, Vercel preview, deploy prod
```

Regla SDD: cada spec describe **inputs, outputs, casos de borde, criterios de aceptación**. No se empieza código de un módulo hasta que su spec esté revisada.
