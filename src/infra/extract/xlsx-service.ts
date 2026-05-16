import 'server-only';
import { callChat } from '@/infra/ai/call-chat';
import { sha256 } from '@/lib/hash';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { parseDecimal, parseMoney } from '@/lib/parse-money';
import { normalizeOffer } from '@/core/extract/normalize';
import {
  detectColumnMap,
  detectHeaderRow,
  hasMinimumMapping,
  type XlsxColumnMap,
} from '@/core/extract/xlsx-column-mapping';
import {
  extractHeaderHeuristic,
  inferSupplierFromFilename,
} from '@/core/extract/xlsx-header-heuristic';
import {
  buildXlsxHeaderPrompt,
  buildXlsxMappingPrompt,
  XLSX_HEADER_SYSTEM_PROMPT,
  XLSX_MAPPING_SYSTEM_PROMPT,
  XlsxColumnMappingResponse,
  XlsxHeaderResponse,
} from '@/core/extract/xlsx-mapping-prompts';
import {
  ExtractedOffer,
  type ExtractedHeader,
  type ExtractedItem,
  type ExtractedOfferWithMeta,
} from '@/core/extract/schema';
import { readXlsx, XlsxTextError, type XlsxSheet } from './xlsx-text';
import { getCachedExtraction, saveExtraction } from './cache';

export type XlsxExtractFailureReason =
  | 'corrupt_xlsx'
  | 'password_protected'
  | 'no_structured_data'
  | 'schema_validation_failed';

export class XlsxExtractError extends Error {
  constructor(
    message: string,
    public readonly reason: XlsxExtractFailureReason,
  ) {
    super(message);
    this.name = 'XlsxExtractError';
  }
}

export interface ExtractXlsxArgs {
  buffer: Buffer;
  fileName: string;
  mime: string;
  offerId?: number;
}

const DIRECT_STRATEGY_MARKER = 'xlsx-direct';

export async function extractXlsx(args: ExtractXlsxArgs): Promise<ExtractedOfferWithMeta> {
  const fileHash = sha256(args.buffer);
  const log = logger.child({
    offerId: args.offerId,
    fileName: args.fileName,
    fileHash: fileHash.slice(0, 12),
  });

  const cached = await getCachedExtraction(fileHash);
  if (cached) {
    const isDirect = cached.model === DIRECT_STRATEGY_MARKER;
    log.info({ items: cached.payload.items.length, model: cached.model }, '[xlsx] cache HIT');
    return {
      ...cached.payload,
      meta: {
        strategy: isDirect ? 'xlsx-direct' : 'xlsx-llm-mapped',
        model: isDirect ? null : cached.model,
        fromCache: true,
      },
    };
  }
  log.info('[xlsx] cache MISS, parsing');

  let sheets: XlsxSheet[];
  try {
    sheets = readXlsx(args.buffer);
  } catch (err) {
    if (err instanceof XlsxTextError) {
      throw new XlsxExtractError(err.message, mapXlsxTextReason(err.reason));
    }
    throw err;
  }

  const picked = pickSheetWithItems(sheets);
  if (!picked) {
    log.warn('[xlsx] no sheet with detectable items table');
    return await runLlmAssistedFallback(args, sheets, fileHash);
  }

  log.info(
    { sheet: picked.sheet.name, headerRow: picked.headerRowIndex, columns: picked.columnMap },
    '[xlsx] header detected (path A)',
  );

  const items = readItems(picked.sheet.rows, picked.headerRowIndex, picked.columnMap);
  if (items.length === 0) {
    log.warn('[xlsx] header detected but no items extracted');
    return await runLlmAssistedFallback(args, sheets, fileHash);
  }

  const preTable = picked.sheet.rows.slice(0, picked.headerRowIndex);
  let header = extractHeaderHeuristic(preTable);
  let strategyModel: string | null = null;

  if (!header.supplierName && preTable.length > 0) {
    const cells = collectPreTableCells(preTable);
    if (cells.length && cells.length <= 30) {
      try {
        const llmHeader = await callChat({
          kind: 'EXTRACT_ITEMS',
          ...(args.offerId !== undefined && { offerId: args.offerId }),
          model: env.EXTRACT_MODEL,
          systemPrompt: XLSX_HEADER_SYSTEM_PROMPT,
          userPrompt: buildXlsxHeaderPrompt(cells),
          outputSchema: XlsxHeaderResponse,
          candidatesConsidered: { strategy: 'xlsx-header', cellCount: cells.length },
        });
        header = mergeHeader(header, llmHeader.data);
        strategyModel = env.EXTRACT_MODEL;
      } catch (err) {
        log.warn({ err: (err as Error).message }, '[xlsx] header LLM failed, using heuristic');
      }
    }
  }

  if (!header.supplierName) {
    header.supplierName = inferSupplierFromFilename(args.fileName);
  }

  const offer: ExtractedOffer = { header, items };
  const validated = ExtractedOffer.safeParse(offer);
  if (!validated.success) {
    throw new XlsxExtractError(
      `Schema inválido: ${validated.error.issues.map((i) => i.message).join('; ')}`,
      'schema_validation_failed',
    );
  }

  const normalized = normalizeOffer(validated.data);
  await saveExtraction({
    fileHash,
    fileName: args.fileName,
    mime: args.mime,
    model: DIRECT_STRATEGY_MARKER,
    payload: normalized,
  });

  log.info({ items: items.length, model: strategyModel }, '[xlsx] direct path done');

  return {
    ...normalized,
    meta: { strategy: 'xlsx-direct', model: strategyModel, fromCache: false },
  };
}

function mapXlsxTextReason(reason: XlsxTextError['reason']): XlsxExtractFailureReason {
  if (reason === 'password_protected') return 'password_protected';
  if (reason === 'no_sheets') return 'no_structured_data';
  return 'corrupt_xlsx';
}

interface PickedSheet {
  sheet: XlsxSheet;
  headerRowIndex: number;
  columnMap: XlsxColumnMap;
}

function pickSheetWithItems(sheets: ReadonlyArray<XlsxSheet>): PickedSheet | null {
  for (const sheet of sheets) {
    const detection = detectHeaderRow(sheet.rows);
    if (detection) {
      return { sheet, headerRowIndex: detection.rowIndex, columnMap: detection.columnMap };
    }
  }
  return null;
}

const TOTALS_PATTERN = /^(total|subtotal|iva|impuesto|descuento)/i;

function readItems(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  headerRowIndex: number,
  map: XlsxColumnMap,
): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  let lineCounter = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const description = readString(row, map.description);
    if (!description) continue;
    if (TOTALS_PATTERN.test(description.trim())) continue;

    lineCounter += 1;
    const lineNumber = readLineNumber(row, map.lineNumber) ?? lineCounter;

    const priceCell = map.unitPrice !== undefined ? row[map.unitPrice] : null;
    const money = parseMoney(coerceForMoney(priceCell));
    const explicitCurrency = readString(row, map.currency);

    const quantity = parseDecimal(
      coerceForMoney(map.quantity !== undefined ? row[map.quantity] : null),
    );

    items.push({
      lineNumber,
      supplierCode: readString(row, map.supplierCode),
      description: description.trim(),
      quantity,
      unitPrice: money.amount,
      currency: normalizeCurrency(explicitCurrency ?? money.currency),
      unit: readString(row, map.unit),
      rawObservations: readString(row, map.rawObservations),
    });
  }

  return items;
}

function readString(row: ReadonlyArray<unknown>, col: number | undefined): string | null {
  if (col === undefined) return null;
  const cell = row[col];
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'string') {
    const trimmed = cell.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof cell === 'number') return String(cell);
  if (cell instanceof Date) return cell.toISOString();
  return null;
}

function readLineNumber(row: ReadonlyArray<unknown>, col: number | undefined): number | null {
  if (col === undefined) return null;
  const cell = row[col];
  if (typeof cell === 'number' && Number.isInteger(cell) && cell > 0) return cell;
  if (typeof cell === 'string') {
    const n = Number(cell.trim());
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function coerceForMoney(cell: unknown): string | number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'string' || typeof cell === 'number') return cell;
  return null;
}

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper.length !== 3) return null;
  return upper;
}

function collectPreTableCells(rows: ReadonlyArray<ReadonlyArray<unknown>>): string[] {
  const cells: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      if (typeof cell === 'string') {
        const trimmed = cell.trim();
        if (trimmed) cells.push(trimmed);
      } else if (typeof cell === 'number') {
        cells.push(String(cell));
      } else if (cell instanceof Date) {
        cells.push(cell.toISOString().slice(0, 10));
      }
    }
  }
  return cells;
}

function mergeHeader(base: ExtractedHeader, llm: ExtractedHeader): ExtractedHeader {
  return {
    supplierName: base.supplierName ?? llm.supplierName,
    offerDate: base.offerDate ?? llm.offerDate,
    observations: base.observations ?? llm.observations,
  };
}

async function runLlmAssistedFallback(
  args: ExtractXlsxArgs,
  sheets: ReadonlyArray<XlsxSheet>,
  fileHash: string,
): Promise<ExtractedOfferWithMeta> {
  const log = logger.child({
    offerId: args.offerId,
    fileName: args.fileName,
    fileHash: fileHash.slice(0, 12),
  });
  const sheet = sheets[0];
  if (!sheet || sheet.rows.length === 0) {
    throw new XlsxExtractError('XLSX sin contenido detectable', 'no_structured_data');
  }

  const sample = sheet.rows.slice(0, 10);
  log.info({ sampleRows: sample.length }, '[xlsx] running path B (LLM mapping)');

  let mapping: XlsxColumnMappingResponse;
  try {
    const llm = await callChat({
      kind: 'EXTRACT_ITEMS',
      ...(args.offerId !== undefined && { offerId: args.offerId }),
      model: env.EXTRACT_MODEL,
      systemPrompt: XLSX_MAPPING_SYSTEM_PROMPT,
      userPrompt: buildXlsxMappingPrompt(sample),
      outputSchema: XlsxColumnMappingResponse,
      candidatesConsidered: { strategy: 'xlsx-llm-mapping', sampleRows: sample.length },
    });
    mapping = llm.data;
  } catch (err) {
    throw new XlsxExtractError(
      `Mapping LLM falló: ${(err as Error).message}`,
      'no_structured_data',
    );
  }

  const map = toColumnMap(mapping);
  if (!hasMinimumMapping(map)) {
    throw new XlsxExtractError(
      'LLM no logró mapear columnas mínimas (description + qty/precio)',
      'no_structured_data',
    );
  }

  const headerRowIndex = guessHeaderRowAfterMapping(sheet.rows, map);
  const items = readItems(sheet.rows, headerRowIndex, map);
  if (items.length === 0) {
    throw new XlsxExtractError('Mapping aplicado pero sin filas válidas', 'no_structured_data');
  }

  const preTable = sheet.rows.slice(0, headerRowIndex);
  const heuristicHeader = extractHeaderHeuristic(preTable);
  const header = {
    ...heuristicHeader,
    supplierName: heuristicHeader.supplierName ?? inferSupplierFromFilename(args.fileName),
  };

  const offer = ExtractedOffer.parse({ header, items });
  const normalized = normalizeOffer(offer);

  await saveExtraction({
    fileHash,
    fileName: args.fileName,
    mime: args.mime,
    model: env.EXTRACT_MODEL,
    payload: normalized,
  });

  log.info({ items: items.length }, '[xlsx] LLM-mapped path done');

  return {
    ...normalized,
    meta: { strategy: 'xlsx-llm-mapped', model: env.EXTRACT_MODEL, fromCache: false },
  };
}

function toColumnMap(r: XlsxColumnMappingResponse): XlsxColumnMap {
  const map: XlsxColumnMap = { description: r.description };
  if (r.lineNumber !== null) map.lineNumber = r.lineNumber;
  if (r.supplierCode !== null) map.supplierCode = r.supplierCode;
  if (r.quantity !== null) map.quantity = r.quantity;
  if (r.unitPrice !== null) map.unitPrice = r.unitPrice;
  if (r.currency !== null) map.currency = r.currency;
  if (r.unit !== null) map.unit = r.unit;
  if (r.rawObservations !== null) map.rawObservations = r.rawObservations;
  return map;
}

function guessHeaderRowAfterMapping(
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  map: XlsxColumnMap,
): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const detected = detectColumnMap(row);
    if (detected.description === map.description) return i;
  }
  return 0;
}
