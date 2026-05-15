# Spec 01 — Modelo de datos

## Objetivo

Definir entidades, relaciones, invariantes e índices para que el flujo extracción → conciliación → trazabilidad funcione sin ambigüedad y con consultas baratas en case-complex.

## Entidades

### PurchaseRequest

Cabecera de la solicitud cargada desde `purchase_requests.csv`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK interna |
| `externalId` | String | `REQ-OFI-2026-001`. Unique. Index. |
| `title` | String | |
| `createdAt` | DateTime | default now |

### PurchaseRequestItem

Líneas pedidas. Una por fila de `purchase_request_items.csv`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `requestId` | Int | FK → PurchaseRequest, onDelete Cascade |
| `externalItemId` | Int | `item_id` del CSV (1, 2, 3...) |
| `description` | String | crudo del CSV |
| `quantity` | Decimal(14,3) | |
| `unit` | String | `unidad`, `metro`, `rollo` |
| `createdAt` | DateTime | |

Constraint: `unique(requestId, externalItemId)`. Index: `(requestId)`.

### Offer

Oferta procesada de un proveedor para una solicitud puntual.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `requestId` | Int | FK → PurchaseRequest, onDelete Cascade |
| `supplierName` | String? | puede faltar en oferta mal estructurada |
| `offerDate` | DateTime? | |
| `sourceFile` | String | nombre original del archivo |
| `sourceFileHash` | String | sha256 hex. Unique. Habilita cache. |
| `sourceFileMime` | String | `application/pdf`, `application/vnd.openxmlformats...` |
| `observations` | String? | texto largo |
| `status` | Enum `OfferStatus` | máquina de estados (ver abajo) |
| `failureReason` | String? | si status = FAILED |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Index: `(requestId)`, `(sourceFileHash)`, `(status)`.

### OfferItem

Líneas extraídas de la oferta.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `offerId` | Int | FK → Offer, onDelete Cascade |
| `lineNumber` | Int | orden en la oferta original (1, 2, 3...) |
| `supplierCode` | String? | `SIP-00110`, `OFN-00110` |
| `description` | String | descripción cruda del proveedor |
| `quantity` | Decimal(14,3)? | nullable: el spec dice "qty cuando esté presente" |
| `unitPrice` | Decimal(14,4)? | |
| `currency` | String? | ISO 4217 (`ARS`, `USD`) |
| `unit` | String? | crudo, sin normalizar todavía |
| `rawObservations` | String? | observaciones por ítem |
| `createdAt` | DateTime | |

Index: `(offerId)`, `(offerId, lineNumber)` unique.

### Reconciliation

Resultado agregado de conciliar una oferta contra su solicitud.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `offerId` | Int | FK → Offer, onDelete Cascade. Unique (1:1) |
| `requestId` | Int | FK → PurchaseRequest |
| `summary` | String? | Markdown generado |
| `itemsCovered` | Int | match + partial_quantity |
| `itemsMissing` | Int | missing_from_offer |
| `itemsExtra` | Int | extra |
| `itemsPartial` | Int | partial_quantity |
| `itemsLowConfidence` | Int | downgrade por verificadores |
| `totalPromptTokens` | Int | suma de DecisionLog |
| `totalCompletionTokens` | Int | |
| `totalCostUsd` | Decimal(10,6) | costo total estimado |
| `createdAt` | DateTime | |
| `completedAt` | DateTime? | null mientras corre |

Index: `(offerId)` unique, `(requestId)`.

### ReconciliationLine

Una línea por decisión. Cubre los 4 tipos de relación más `low_confidence`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `reconciliationId` | Int | FK → Reconciliation, onDelete Cascade |
| `offerItemId` | Int? | FK → OfferItem. Null si `missing_from_offer` |
| `requestItemId` | Int? | FK → PurchaseRequestItem. Null si `extra` |
| `relation` | Enum `LineRelation` | MATCH, PARTIAL_QUANTITY, MISSING_FROM_OFFER, EXTRA, LOW_CONFIDENCE |
| `confidence` | Decimal(4,3) | rango [0, 1] |
| `embeddingSimilarity` | Decimal(4,3)? | coseno del shortlist, [0, 1] |
| `quantityRequested` | Decimal(14,3)? | snapshot al momento de conciliar |
| `quantityOffered` | Decimal(14,3)? | snapshot |
| `rationale` | String | corto, ≤ 280 chars |
| `flags` | Json | array de strings: `['quantity_anomaly', 'unit_mismatch', 'excess', 'currency_unknown']` |
| `createdAt` | DateTime | |

Constraint: chequear en aplicación que `offerItemId IS NOT NULL OR requestItemId IS NOT NULL` (Prisma no soporta CHECK directo en MySQL, valida el servicio).

Index: `(reconciliationId)`, `(offerItemId)`, `(requestItemId)`, `(relation)`.

### DecisionLog

Auditoría de cada llamada al LLM. No se borra al eliminar Offer (audit trail).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | BigInt autoincrement | PK. BigInt porque crece rápido. |
| `offerId` | Int? | FK → Offer, onDelete SetNull |
| `reconciliationLineId` | Int? | FK → ReconciliationLine, onDelete SetNull |
| `kind` | Enum `DecisionKind` | EXTRACT_HEADER, EXTRACT_ITEMS, EMBED_REQUEST, EMBED_OFFER, JUDGE_BATCH |
| `model` | String | `gpt-4o-mini`, `text-embedding-3-small` |
| `promptTokens` | Int | |
| `completionTokens` | Int | |
| `costUsd` | Decimal(10,6) | calculado en wrapper |
| `prompt` | Text | truncado a 10k chars si excede |
| `rawResponse` | Text | truncado a 10k chars si excede |
| `candidatesConsidered` | Json? | `[{requestItemId, similarity}, ...]` para JUDGE_BATCH |
| `durationMs` | Int | |
| `createdAt` | DateTime | |

Index: `(offerId)`, `(kind, createdAt)`.

### ExtractionCache

Resultado de extracción cacheado por hash de archivo. Evita re-llamar al LLM cuando el mismo archivo se sube de nuevo.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | Int autoincrement | PK |
| `fileHash` | String | sha256. Unique. |
| `fileName` | String | último nombre visto |
| `mime` | String | |
| `payload` | Json | `{ header: {...}, items: [...] }` validado por Zod |
| `model` | String | modelo que generó la extracción |
| `createdAt` | DateTime | |

Index: `(fileHash)` unique.

## Enums

```ts
enum OfferStatus {
  PENDING         // archivo subido, esperando extracción
  EXTRACTING      // LLM corriendo
  EXTRACTED       // items persistidos, lista para conciliar
  RECONCILING     // conciliación en curso
  RECONCILED      // terminada con éxito
  FAILED          // error definitivo
}

enum LineRelation {
  MATCH
  PARTIAL_QUANTITY
  MISSING_FROM_OFFER
  EXTRA
  LOW_CONFIDENCE
}

enum DecisionKind {
  EXTRACT_HEADER
  EXTRACT_ITEMS
  EMBED_REQUEST
  EMBED_OFFER
  JUDGE_BATCH
}
```

## Diagrama de relaciones

```
PurchaseRequest 1───N PurchaseRequestItem
       │
       │ 1
       │
       N
     Offer 1───N OfferItem
       │
       │ 1
       │
       1
   Reconciliation 1───N ReconciliationLine ───? OfferItem
                                        └────? PurchaseRequestItem

DecisionLog ───? Offer
            └─? ReconciliationLine

ExtractionCache (standalone, lookup por hash)
```

## Máquina de estados de Offer

```
PENDING ──extract()──> EXTRACTING ──ok──> EXTRACTED ──reconcile()──> RECONCILING ──ok──> RECONCILED
   │                       │                                              │
   └───────────────────────┴──────────────fail()──────────────────────────┴──> FAILED
```

Reglas:

- Solo `EXTRACTED` puede pasar a `RECONCILING`.
- `RECONCILED` es terminal exitoso.
- `FAILED` es terminal con `failureReason` poblado.
- Re-subir un archivo con mismo `sourceFileHash` no crea Offer nueva: se reusa la existente si está en `RECONCILED` o `EXTRACTED`. Si está en `FAILED`, se permite reintento creando Offer nueva.

## Invariantes

1. `PurchaseRequestItem.quantity ≥ 0`.
2. `OfferItem.quantity ≥ 0` cuando no es null.
3. `OfferItem.unitPrice ≥ 0` cuando no es null.
4. `ReconciliationLine`: al menos uno de `offerItemId` o `requestItemId` debe ser no-null. Validado en servicio antes del insert.
5. `ReconciliationLine.confidence` ∈ [0, 1].
6. `ReconciliationLine.embeddingSimilarity` ∈ [0, 1] cuando no es null.
7. `Reconciliation` es 1:1 con `Offer` (offerId unique).
8. `Offer.sourceFileHash` unique a nivel global (cache cross-request).
9. `ExtractionCache.fileHash` unique.
10. `Offer.status = RECONCILED` ⟹ existe `Reconciliation.completedAt` no-null.

## Cascadas

| Padre | Hijo | Acción al borrar padre |
|---|---|---|
| PurchaseRequest | PurchaseRequestItem | Cascade |
| PurchaseRequest | Offer | Cascade |
| Offer | OfferItem | Cascade |
| Offer | Reconciliation | Cascade |
| Reconciliation | ReconciliationLine | Cascade |
| OfferItem | ReconciliationLine | SetNull (mantener línea con razón) |
| PurchaseRequestItem | ReconciliationLine | SetNull |
| Offer | DecisionLog | SetNull (auditoría sobrevive) |
| ReconciliationLine | DecisionLog | SetNull |

## Decimales

Precisión elegida pensando en el dominio:

- `quantity`: `Decimal(14, 3)`. Cubre rollos de cinta hasta cables industriales con 3 decimales si la oferta los trae.
- `unitPrice`: `Decimal(14, 4)`. Algunos proveedores cotizan por unidad con 4 decimales.
- `costUsd`: `Decimal(10, 6)`. Costos de tokens son fracciones chicas.
- `confidence`, `embeddingSimilarity`: `Decimal(4, 3)`. Suficiente para 0.000 a 1.000.

No usar `Float` para ningún campo monetario. `Decimal` es exacto en MySQL.

## Soft delete

No se implementa. Si una solicitud o oferta se borra, se borra. Es challenge, no SaaS. Si en el futuro hace falta auditoría completa, se agrega `deletedAt` y se filtra.

## Casos de borde del modelo

- Oferta sin `supplierName` extraído → guardar `null`, flag en `Reconciliation.summary`.
- Oferta con items duplicados (mismo `description` dos veces) → consolidar en `OfferItem` único con qty sumada antes de persistir. Loguear consolidación en `DecisionLog`.
- Oferta con `quantity = 0` en un ítem → guardar `0`, conciliación lo trata como `extra` o `missing` según contexto.
- Item ofertado con `quantity = null` → se permite, no participa en chequeo de `quantity_anomaly`.
- Re-subir mismo archivo con distinto nombre → `ExtractionCache` matchea por hash, no por nombre. Devuelve payload cacheado.
- LLM extrae 0 items → `Offer.status = FAILED` con `failureReason = "no_items_extracted"`.
- ReconciliationLine con relación `EXTRA` pero embedding ≥ 0.65 → significa que el embedding encontró similaridad pero el judge la rechazó. Loguear en DecisionLog.

## Criterios de aceptación

- `prisma migrate dev --name init` corre sin errores en MySQL 8 dockerizado.
- Tests unitarios validan invariantes 1-10 con casos positivos y negativos.
- Seed pobla `PurchaseRequest` + `PurchaseRequestItem` para los dos escenarios (case-simple y case-complex).
- Query `SELECT * FROM ReconciliationLine WHERE relation = 'MISSING_FROM_OFFER' AND reconciliationId = ?` corre con index hit (verificar con `EXPLAIN`).
- Borrar una `Offer` borra en cascada sus items, reconciliation y lines pero deja DecisionLog intacto (validar con test).

## Schema Prisma (esqueleto)

Se persiste en `prisma/schema.prisma`. La spec 02 (`02-seed.md`) consume este schema.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model PurchaseRequest {
  id         Int                   @id @default(autoincrement())
  externalId String                @unique
  title      String
  createdAt  DateTime              @default(now())
  items      PurchaseRequestItem[]
  offers     Offer[]

  @@index([externalId])
}

model PurchaseRequestItem {
  id              Int                  @id @default(autoincrement())
  requestId       Int
  externalItemId  Int
  description     String
  quantity        Decimal              @db.Decimal(14, 3)
  unit            String
  createdAt       DateTime             @default(now())
  request         PurchaseRequest      @relation(fields: [requestId], references: [id], onDelete: Cascade)
  reconciliationLines ReconciliationLine[]

  @@unique([requestId, externalItemId])
  @@index([requestId])
}

// ... resto en la implementación
```

Schema completo va en `prisma/schema.prisma` cuando se implemente. La spec lo deja con esqueleto representativo.

## Próximo

- `02-seed.md` consume este modelo y define el script de carga desde CSVs.
