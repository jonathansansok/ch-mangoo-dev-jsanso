# challenge-ok

Procesamiento y conciliación de ofertas de proveedor con AI.

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript estricto
- Prisma + MySQL 8 (Docker en dev, Railway en prod)
- OpenAI: `gpt-4o-mini` (extracción y judge), `text-embedding-3-small` (shortlist)
- Tailwind 4 + componentes custom
- Zod, react-hook-form, react-query, pino
- Vitest, MSW
- Despliegue: Railway unified

## Quickstart

```bash
cp .env.example .env.local
# Editar .env.local con OPENAI_API_KEY

docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abrir <http://localhost:3000>.

## Estructura

```
src/
  app/          rutas Next App Router
  core/         lógica pura (reconcile, output)
  infra/        DB, extractors PDF/XLSX, OpenAI wrapper
  lib/          helpers
  env.ts        validación Zod de env vars
scripts/
  seed.ts       CSV → DB
prisma/
  schema.prisma
fixtures/
  scenarios/    datos de prueba (case-simple, case-complex)
specs/          documentos de Spec-Driven Development
docs/
  challenge.pdf
```

## Specs

El proyecto sigue Spec-Driven Development. Cada módulo tiene su spec en `specs/`:

- `00-overview.md` decisiones macro
- `01-data-model.md` entidades Prisma
- `02-seed.md` CSV → DB
- `03-extract-pdf.md` pipeline PDF
- `04-extract-xlsx.md` pipeline XLSX
- `05-reconcile.md` algoritmo de matching
- `06-output-markdown.md` resumen para comprador
- `07-traceability.md` DecisionLog
- `08-api-and-ui.md` rutas Next
- `09-testing-strategy.md` pirámide de tests
- `10-ci-cd.md` GitHub Actions + Railway
- `ui-style.md` palette y componentes

## Scripts

```
pnpm dev              # next dev
pnpm build            # next build
pnpm start            # next start
pnpm lint             # ESLint
pnpm format           # Prettier write
pnpm format:check     # Prettier check
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm test:watch       # vitest watch
pnpm db:migrate       # prisma migrate dev
pnpm db:seed          # cargar fixtures
pnpm db:studio        # prisma studio
```

## Convenciones

- Conventional Branch + Conventional Commits con scope.
- Ver `CLAUDE.md` para reglas de estilo de código y workflow AI.

## Despliegue

Railway unified: app + MySQL en un solo proyecto. Push a `main` dispara deploy automático.
