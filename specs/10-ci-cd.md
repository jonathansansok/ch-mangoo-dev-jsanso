# Spec 10 — CI/CD

## Objetivo

Pipeline automatizado de calidad + deploy en Railway. Cada PR corre lint, typecheck, tests y build. Cada merge a `main` despliega a producción. Preview environments por PR.

## Estructura

```
.github/
  workflows/
    ci.yml                # quality gates en cada push y PR
    deploy.yml            # deploy a Railway en push a main
    e2e.yml               # e2e con OpenAI real, trigger manual o nightly
  dependabot.yml          # update deps semanal
  pull_request_template.md
```

## `ci.yml`

Quality gates. Corre en push y PR a cualquier rama.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

env:
  NODE_VERSION: '22'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpass
          MYSQL_DATABASE: oferta_test
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping -h localhost -uroot -ptestpass"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10
    env:
      DATABASE_URL: mysql://root:testpass@localhost:3306/oferta_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test:unit
      - run: pnpm test:integration

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma generate
      - run: pnpm build
        env:
          # Build no necesita DB real, pero Prisma generate sí necesita la URL
          DATABASE_URL: mysql://dummy:dummy@localhost:3306/dummy
          SKIP_ENV_VALIDATION: 'true'

  commitlint:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm commitlint --from origin/main --to HEAD --verbose
```

Jobs paralelos donde se puede. `build` espera a `lint` + `typecheck` (no tiene sentido buildear con código roto).

## `deploy.yml`

Deploy a Railway. Solo en push a `main` después de merge.

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Railway CLI
        run: curl -fsSL https://railway.app/install.sh | sh
      - name: Deploy
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway up --service app --detach

      - name: Run migrations
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        run: railway run --service app -- pnpm prisma migrate deploy

      - name: Health check
        run: |
          sleep 15
          curl -fsSL https://challenge-ok.up.railway.app/api/health || exit 1
```

Pasos:

1. Build + push imagen a Railway con `railway up`.
2. Migraciones `prisma migrate deploy` contra DB de prod.
3. Smoke test al `/api/health` post-deploy.

Si cualquier paso falla, el job falla y se notifica.

`secrets.RAILWAY_TOKEN`: project token de Railway, scope al proyecto del challenge. Se configura una vez en GitHub.

## `e2e.yml`

Tests e2e con OpenAI real. Solo manual o nightly.

```yaml
name: E2E

on:
  workflow_dispatch:
  schedule:
    - cron: '0 4 * * *' # 04:00 UTC diario

jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: testpass
          MYSQL_DATABASE: oferta_test
        ports: ['3306:3306']
        options: >-
          --health-cmd="mysqladmin ping -h localhost -uroot -ptestpass"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10
    env:
      DATABASE_URL: mysql://root:testpass@localhost:3306/oferta_test
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_E2E }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test:e2e
```

`OPENAI_API_KEY_E2E`: key con límite de gasto bajo (ej. $5/mes hard limit). Distinta de la de producción.

## Preview environments en Railway

Railway soporta PR environments nativos. Configuración:

1. En el dashboard de Railway, conectar el repo GitHub.
2. Habilitar "PR Environments" en settings del proyecto.
3. Railway crea un environment efímero por cada PR abierto, levanta el servicio + MySQL nuevo, expone URL única.
4. URL se postea como comment en el PR vía Railway GitHub App.
5. Al cerrar el PR, el environment se destruye automáticamente.

Variables por PR environment: las mismas que prod, pero apuntando a su DB efímera. `OPENAI_API_KEY` se puede compartir o usar una key de testing con bajo límite.

## `dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
      day: 'monday'
    open-pull-requests-limit: 5
    groups:
      prisma:
        patterns: ['@prisma/*', 'prisma']
      tanstack:
        patterns: ['@tanstack/*']
      types:
        patterns: ['@types/*']
        dependency-type: 'development'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

Agrupado para reducir ruido de PRs sueltas.

## `pull_request_template.md`

```markdown
## Resumen

Breve descripción de qué hace este PR y por qué.

## Tipo de cambio

- [ ] feat
- [ ] fix
- [ ] chore
- [ ] docs
- [ ] refactor
- [ ] test
- [ ] ci

## Checklist

- [ ] Tests agregados o actualizados.
- [ ] `pnpm lint` y `pnpm typecheck` pasan en local.
- [ ] Documentación actualizada si aplica.
- [ ] Screenshots si tocó UI.
- [ ] Sin secrets en código ni en logs.
- [ ] Sin firmas AI en commits o código (`Co-Authored-By: Claude`, emojis, etc).

## Spec relacionada

Link a `specs/0X-*.md` si aplica.
```

## Branch protection en `main`

Configurar en GitHub settings:

- Require PR before merge.
- Require status checks: `lint`, `typecheck`, `test`, `build`, `commitlint`.
- Require branches up to date.
- Squash merge only.
- Delete branch on merge.
- No force push.

## Secrets en GitHub

| Secret               | Uso                                             |
| -------------------- | ----------------------------------------------- |
| `RAILWAY_TOKEN`      | Deploy a Railway. Project token.                |
| `OPENAI_API_KEY_E2E` | Tests e2e con OpenAI real. Key con límite bajo. |

Variables públicas (no secrets):

| Var            | Valor |
| -------------- | ----- |
| `NODE_VERSION` | `22`  |

## Variables de entorno de Railway

Configuradas en el servicio `app` de Railway:

| Var                      | Origen                     |
| ------------------------ | -------------------------- |
| `DATABASE_URL`           | inyectado por plugin MySQL |
| `OPENAI_API_KEY`         | secret manual              |
| `MAX_TOKENS_PER_RUN`     | manual, default `100000`   |
| `NODE_ENV`               | `production`               |
| `RAILWAY_GIT_COMMIT_SHA` | inyectado por Railway      |
| `MIN_SIMILARITY`         | manual, default `0.65`     |
| `JUDGE_BATCH_SIZE`       | manual, default `10`       |
| `SHORTLIST_K`            | manual, default `5`        |

## `railway.json` o `nixpacks.toml`

`nixpacks.toml` en raíz del repo:

```toml
[phases.setup]
nixPkgs = ['nodejs_22', 'pnpm']

[phases.install]
cmds = ['pnpm install --frozen-lockfile']

[phases.build]
cmds = ['pnpm prisma generate', 'pnpm build']

[start]
cmd = 'pnpm start'
```

Railway detecta y usa esta config. Alternativa: `Dockerfile` multi-stage. Decisión: **nixpacks**. Más simple y Railway lo soporta nativamente.

## Local hooks con Husky

Pre-commit:

```sh
#!/bin/sh
pnpm lint-staged
```

`lint-staged.config.js`:

```js
export default {
  '*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml}': ['prettier --write'],
};
```

Commit-msg:

```sh
#!/bin/sh
pnpm commitlint --edit "$1"
```

`commitlint.config.js`:

```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'scope-enum': [
      2,
      'always',
      [
        'seed',
        'db',
        'extract',
        'reconcile',
        'ai',
        'ui',
        'api',
        'infra',
        'ci',
        'deps',
        'docs',
        'output',
        'trace',
        'repo',
      ],
    ],
  },
};
```

## Performance del pipeline

Targets:

- Total CI por PR: < 3 minutos.
- Build: < 90s.
- Tests unit + integration: < 60s.
- Deploy completo (push a main → producción saludable): < 4 minutos.

Optimizaciones:

- Cache de `pnpm-lock.yaml` hash → restore de `node_modules` en ~10s.
- Cache de `.next/cache` entre runs.
- `--frozen-lockfile` siempre.
- Jobs paralelos.

## Notificaciones

- PR comment automático de Railway con preview URL.
- Failures de CI: GitHub notifica al author del commit.
- Sin Slack/Discord webhook por ahora (mejora futura).

## Rollback

Si el deploy a prod falla la health check:

1. El job falla, no se marca como deployed.
2. El usuario humano puede hacer rollback manual en Railway dashboard (Railway mantiene últimos 5 deploys).
3. Documentar en README: "Para rollback, abrir Railway dashboard → app → Deployments → Redeploy version anterior".

Rollback automático ante failure: out of scope. Sería una mejora razonable con Railway API.

## Criterios de aceptación

- PR a `main` corre `lint`, `typecheck`, `test`, `build`, `commitlint` y todos pasan.
- Merge a `main` dispara deploy a Railway, levanta migración, smoke test pasa, URL responde 200.
- PR abierto crea preview environment en Railway con URL en comment del PR.
- Dependabot abre PRs semanales agrupados.
- Workflow `e2e.yml` corre manual con `gh workflow run e2e.yml`.
- Tiempo total de pipeline < 3 min.

## Out of scope

- Multi-region deploy.
- Blue-green o canary.
- Telemetría OpenTelemetry al deploy.
- Notificaciones Slack.
- Rollback automático ante failure.
- Performance budget en CI (Lighthouse CI).

## Última spec del plan

Esta es la 10a spec planeada en `00-overview.md`. Con esto el SDD está completo. La siguiente fase es la implementación: scaffold inicial + módulos por feature siguiendo el orden de las specs.
