# Benchmarks vs `reconciliation_guide.md`

Resultados de ejecutar el pipeline (extract + reconcile + reverse pass) contra los fixtures del challenge, medidos contra la guía humana incluida en cada escenario.

Última corrida: 2026-05-16 con `EXTRACT_MODEL=gpt-4o-mini` + `JUDGE_MODEL=gpt-4.1-mini` + `EMBED_MODEL=text-embedding-3-small`.

## case-simple (REQ-OFI-2026-001, 6 items pedidos)

| Métrica            | PDF Comercial Oficinas | XLSX Oficenter Norte |
| ------------------ | ---------------------- | -------------------- |
| Items ofertados    | 6 / 6 ✓                | 7 / 7 ✓              |
| Cubiertos vs guide | 5 / 5 ✓                | 7 / 7 ✓              |
| Missing            | 1 / 1 ✓                | 0 / 0 ✓              |
| Extras             | 1 / 1 ✓                | 1 / 1 ✓              |
| Strategy extract   | text (1 chunk)         | xlsx-direct          |
| Tiempo total       | ~30s                   | ~10s                 |
| Costo              | ~$0.0005               | ~$0.0003             |

case-simple: **100% match con guide** en ambos formatos.

## case-complex (REQ-MOP-2026-001, 220 items pedidos)

### PDF `oferta_mantenimiento_integral.pdf` (Mantenimiento Integral Sur — propuesta parcial)

| Métrica                     | Actual | Guide | Δ   |
| --------------------------- | ------ | ----- | --- |
| Items ofertados             | 177    | 177   | 0 ✓ |
| Cubiertos (match + parcial) | 171    | 172   | −1  |
| Missing                     | 49     | 48    | +1  |
| Extras                      | 6      | 5     | +1  |

- Strategy extract: `text` (chunked, 2 chunks paralelos por `CHUNK_CHAR_BUDGET=12_000`)
- Forward judge: 158 match + 12 partial + 7 extra
- Reverse pass: 51 unassigned → 7 con candidates → 2 recuperados (Canaleta↔Ducto 20x10, Broca pared↔Mecha widia)
- Costo: $0.052 USD
- Tiempo total: 324s (extract dominante: 234s por una de las llamadas con 158 items)
- sumCheck: 220 ✓

### XLSX `oferta_suministros_industriales.xlsx` (Suministros Industriales Pampeanos — cobertura total)

| Métrica                     | Actual | Guide | Δ   |
| --------------------------- | ------ | ----- | --- |
| Items ofertados             | 225    | 225   | 0 ✓ |
| Cubiertos (match + parcial) | 218    | 220   | −2  |
| Missing                     | 2      | 0     | +2  |
| Extras                      | 7      | 5     | +2  |

- Strategy extract: `xlsx-direct` (path A, sin LLM por items, 269ms total)
- Forward judge: 212 match + 4 partial + 9 extra
- Reverse pass: 4 unassigned → 4 con candidates → 2 recuperados (Canaleta↔Ducto 20x10, Sellador siliconado↔Silicona)
- Costo: $0.064 USD
- Tiempo total: 68s
- sumCheck: 220 ✓

## Casos límite consistentes (no recuperados)

Mismos pares semánticamente ambiguos en ambas ofertas:

- `Bandeja pintura plastica` vs `Cubeta pintura plastica` (sim 0.747, judge dudó)
- `Pinza universal` vs `Pinza combinada` (sim 0.813, solo XLSX — PDF no oferta pinzas)

Decisión consciente: con `REVERSE_PASS_MIN_CONFIDENCE=0.7`, el judge prefiere ser conservador y dejarlos como missing+extra antes que asumir match incorrecto. Bajar el threshold a 0.55 los recupera pero arriesga falsos positivos como `Llave francesa ↔ Llave de paso` (que sí ocurrían con `gpt-4o-mini` + threshold 0.45).

## Comparación de modelos en JUDGE

Misma corrida del PDF complex con dos modelos distintos:

| Métrica                          | gpt-4o-mini              | gpt-4.1-mini |
| -------------------------------- | ------------------------ | ------------ |
| Match                            | 146                      | 159          |
| Partial                          | 18                       | 12           |
| Cubiertos                        | 164                      | 171          |
| Missing                          | 55                       | 49           |
| Extras                           | 12                       | 6            |
| Falsos positivos en reverse pass | 4 (Llave francesa, etc.) | 0            |
| sumCheck                         | 219/220                  | 220/220 ✓    |
| Costo total                      | $0.015                   | $0.052       |

`gpt-4.1-mini` calibra mejor las confidences:

- Recoveries genuinas pasan threshold 0.7 naturalmente
- Falsos positivos caen abajo de 0.7 y se descartan automáticamente

## Cobertura final del óptimo

- PDF: 171/172 = **99.4%** del máximo según guide
- XLSX: 218/220 = **99.1%** del máximo según guide
- case-simple: 100% en ambos formatos

## Knobs relevantes (env vars)

| Var                           | Valor | Efecto                                                                     |
| ----------------------------- | ----- | -------------------------------------------------------------------------- |
| `SHORTLIST_K`                 | 10    | Top-K candidatos por offer item para forward judge                         |
| `REVERSE_PASS_K`              | 8     | Top-K extras candidatos para cada unassigned request                       |
| `REVERSE_PASS_MIN_SIMILARITY` | 0.55  | Cosine mínimo para incluir extra en shortlist reverse                      |
| `REVERSE_PASS_MIN_CONFIDENCE` | 0.7   | Confidence judge mínima para aceptar recovery                              |
| `MIN_SIMILARITY`              | 0.55  | Verificador post-judge: por debajo marca la línea con `lowConfidence`      |
| `TRUST_JUDGE_CONFIDENCE`      | 0.7   | Si judge confianza ≥ esto, no se marca `lowConfidence` por similarity baja |
| `JUDGE_BATCH_SIZE`            | 10    | Items por batch al judge                                                   |
| `CHUNK_CHAR_BUDGET`           | 12000 | Chars máx por chunk de PDF (constante de código)                           |
| `EXTRACT_MAX_TOKENS`          | 16000 | Cap output LLM por chunk (constante de código)                             |
