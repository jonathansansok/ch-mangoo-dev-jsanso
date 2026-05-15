# Spec 02 — Seed CSV → DB

## Objetivo

Cargar los datos iniciales de `fixtures/scenarios/*/purchase_requests.csv` y `purchase_request_items.csv` a la DB. Idempotente, validado, sin acoplar la app a este input (el seed es separado del runtime).

## Inputs

```
fixtures/scenarios/case-simple/
  purchase_requests.csv       1 fila
  purchase_request_items.csv  6 filas
fixtures/scenarios/case-complex/
  purchase_requests.csv       1 fila
  purchase_request_items.csv  220 filas
```

Headers:

- `purchase_requests.csv`: `request_id,title`
- `purchase_request_items.csv`: `request_id,item_id,description,quantity,unit`

## Outputs

Tras correr seed con DB vacía o no:

- 2 `PurchaseRequest` (`REQ-OFI-2026-001`, `REQ-MOP-2026-001`).
- 226 `PurchaseRequestItem` (6 + 220).
- Exit code 0 + log con resumen: filas leídas, filas insertadas, filas actualizadas, filas omitidas (si las hubiera).

## Comandos

```
pnpm db:seed              # carga ambos escenarios
pnpm db:seed --reset      # trunca PurchaseRequest + PurchaseRequestItem antes de cargar
pnpm db:seed --only=case-simple   # solo un escenario
```

Configurado en `package.json`:

```json
{
  "scripts": {
    "db:seed": "tsx scripts/seed.ts"
  },
  "prisma": {
    "seed": "tsx scripts/seed.ts"
  }
}
```

Esto último habilita `prisma db seed` también, útil en CI.

## Librerías

- `csv-parse/sync` para parsing. Sync porque los CSVs son chicos (≤220 filas) y no justifica streaming.
- `zod` para validar cada fila.
- `prisma` client para inserts.
- `pino` para logs estructurados.

## Algoritmo

```
1. Resolver lista de escenarios (glob fixtures/scenarios/*/).
2. Por cada escenario filtrado:
   a. Leer purchase_requests.csv (utf-8, strip BOM).
   b. Parsear con csv-parse, validar cada fila con RequestRow schema.
   c. Para cada request: prisma.upsert por externalId.
   d. Leer purchase_request_items.csv, strip BOM.
   e. Parsear, validar con ItemRow schema.
   f. Verificar que todos los request_id referenciados existen.
   g. Por cada item: prisma.upsert por (requestId, externalItemId).
3. Log final: { scenario, requests: N, items: M, durationMs: T }
4. Exit 0.
```

Si `--reset`, antes del paso 2: `prisma.purchaseRequestItem.deleteMany({})` + `prisma.purchaseRequest.deleteMany({})` en transacción.

## Schemas Zod

```ts
const RequestRow = z.object({
  request_id: z.string().regex(/^REQ-[A-Z]+-\d{4}-\d{3}$/),
  title: z.string().trim().min(1),
});

const ItemRow = z.object({
  request_id: z.string().regex(/^REQ-[A-Z]+-\d{4}-\d{3}$/),
  item_id: z.coerce.number().int().positive(),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().nonnegative().finite(),
  unit: z.string().trim().min(1),
});
```

`z.coerce` convierte strings de CSV a number. Si falla, Zod tira error con la fila exacta.

## Idempotencia

- `prisma.purchaseRequest.upsert({ where: { externalId }, update: { title }, create: {...} })`.
- `prisma.purchaseRequestItem.upsert({ where: { requestId_externalItemId: { requestId, externalItemId } }, update: {...}, create: {...} })`.

Correr seed N veces deja el mismo estado. Cambios en CSV se reflejan al re-correr (los `update` se ejecutan).

## Casos de borde

- **BOM al inicio del archivo**: leer con `fs.readFileSync(path, 'utf8').replace(/^﻿/, '')` antes de pasar al parser.
- **CRLF vs LF**: `csv-parse` lo maneja, no requiere normalizar.
- **Filas vacías al final**: `csv-parse` con `skip_empty_lines: true`.
- **Header en mayúsculas mixtas**: forzar `columns: header => header.trim().toLowerCase()`.
- **Comilla mal cerrada**: el parser tira error, se loguea fila + posición.
- **Cantidad con coma decimal (`1,5`)**: las descripciones de los CSVs actuales no la usan, pero por las dudas el script falla con mensaje claro: "quantity con coma decimal no soportada, usar punto". No auto-traducir.
- **Item referencia request_id inexistente**: fail con error claro. No crear request implícitamente.
- **`unit` desconocida**: no se normaliza en seed (queda como `unidad`, `metro`, `rollo`). La normalización ocurre en la fase de reconciliación.
- **CSV con menos columnas que el header**: Zod falla por campo faltante.
- **Filas duplicadas (mismo request_id + item_id)**: la segunda fila sobrescribe vía upsert. Loguear como warning.
- **Encoding distinto de UTF-8**: el script lee como utf-8 estricto. Si los caracteres se ven raros, fallar con "encoding probably not utf-8".

## Logs

Pino con campos:

```json
{
  "level": "info",
  "scenario": "case-complex",
  "requests": 1,
  "items": 220,
  "inserted": 221,
  "updated": 0,
  "skipped": 0,
  "durationMs": 312
}
```

Errores con `level: error` + path del archivo + fila offending.

## Performance

220 inserts con upsert individual es ~1-2s en MySQL local. Suficiente. Si crece a miles, migrar a `createMany({ skipDuplicates: true })` + `updateMany` separado. Documentar como mejora futura, no implementar ahora.

## Estructura del script

```
scripts/
  seed.ts                 # entry point: parseArgs + orchestración
  seed/
    csv.ts                # readCsvFile(path) → string[][] sin BOM
    schemas.ts            # RequestRow, ItemRow
    repository.ts         # upsertRequest, upsertItem
    args.ts               # parse de --reset, --only
```

Mantener `seed.ts` < 100 líneas (orquestación). Lógica en módulos.

## Tests

Vitest con DB de test (env `DATABASE_URL_TEST`):

1. `seed --reset` deja exactamente 2 requests + 226 items.
2. Correr `seed` dos veces seguidas no genera duplicados.
3. `seed --only=case-simple` no toca case-complex existente.
4. CSV con BOM no rompe.
5. CSV con fila inválida (description vacía) sale con exit code distinto de 0.
6. CSV con item referenciando request inexistente falla con error específico.
7. Re-seed con `title` modificado actualiza el registro existente (test de upsert update path).

Setup: `beforeEach` corre migración + truncate tablas relevantes. Usar `--reset` antes de cada test.

## Criterios de aceptación

- `pnpm db:seed` corre limpio contra MySQL dockerizado con DB recién migrada.
- Tras correr: `SELECT COUNT(*) FROM PurchaseRequestItem WHERE requestId IN (SELECT id FROM PurchaseRequest WHERE externalId = 'REQ-MOP-2026-001')` devuelve 220.
- Correr el comando 3 veces seguidas no cambia los counts.
- Tests pasan en CI con un service container MySQL.
- Tiempo total < 3s para los dos escenarios juntos.

## Out of scope

- Carga incremental de nuevos CSVs por feature (el seed es solo para fixtures de challenge).
- UI para gestionar requests (los requests vienen del seed, no se editan en la app).
- Cargar ofertas desde fixtures en el seed (las ofertas se suben por UI durante la demo).

## Próximo

- `03-extract-pdf.md`: pipeline de extracción PDF (texto → LLM → schema Zod → OfferItem[]).
