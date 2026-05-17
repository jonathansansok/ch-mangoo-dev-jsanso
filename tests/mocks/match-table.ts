// Test-only oracle: parsea `fixtures/scenarios/*/reconciliation_guide.md` para
// generar respuestas determinísticas en mocks de OpenAI durante e2e. NUNCA es
// importado por `src/`. La consigna del challenge pide explícitamente que la app
// runtime no dependa de este archivo como input — se respeta.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type GuideRelation = 'match' | 'partial_quantity' | 'missing_from_offer' | 'extra';

export interface GuideRow {
  requestDesc: string | null;
  offerDesc: string | null;
  requestQty: number | null;
  offerQty: number | null;
  relation: GuideRelation;
  supplierCode: string | null;
}

export interface MatchTable {
  rows: GuideRow[];
  buckets: Map<string, number>;
  bucketCount: number;
  offerToRequest: Map<string, string>;
}

const ROW_RE = /^\|\s*(.*)\|\s*$/;

function normalize(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseCells(line: string): string[] {
  const m = line.match(ROW_RE);
  if (!m) return [];
  return m[1]!.split('|').map((c) => c.trim());
}

function parseQty(cell: string): number | null {
  if (!cell) return null;
  const n = Number(cell.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseRelation(cell: string): GuideRelation | null {
  const v = cell.trim().toLowerCase();
  if (v === 'match') return 'match';
  if (v === 'partial_quantity') return 'partial_quantity';
  if (v === 'missing_from_offer') return 'missing_from_offer';
  if (v === 'extra') return 'extra';
  return null;
}

export function parseGuide(
  scenario: 'case-simple' | 'case-complex',
  offerFile: string,
): MatchTable {
  const path = join('fixtures', 'scenarios', scenario, 'reconciliation_guide.md');
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');

  const sectionHeader = `## ${offerFile}`;
  let inSection = false;
  let pastHeader = false;
  const rows: GuideRow[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      inSection = line.trim() === sectionHeader;
      pastHeader = false;
      continue;
    }
    if (!inSection) continue;
    if (!line.startsWith('|')) continue;
    if (/^\|\s*-+/.test(line)) {
      pastHeader = true;
      continue;
    }
    if (!pastHeader) continue;

    const cells = parseCells(line);
    if (cells.length < 9) continue;
    const relation = parseRelation(cells[7] ?? '');
    if (!relation) continue;

    rows.push({
      requestDesc: cells[1] ? cells[1] : null,
      requestQty: parseQty(cells[2] ?? ''),
      supplierCode: cells[4] ? cells[4] : null,
      offerDesc: cells[5] ? cells[5] : null,
      offerQty: parseQty(cells[6] ?? ''),
      relation,
    });
  }

  if (rows.length === 0) {
    throw new Error(`No rows parsed from guide for ${scenario} / ${offerFile}`);
  }

  const buckets = new Map<string, number>();
  const offerToRequest = new Map<string, string>();
  let bucketCounter = 0;

  for (const row of rows) {
    const reqKey = row.requestDesc ? normalize(row.requestDesc) : null;
    const offerKey = row.offerDesc ? normalize(row.offerDesc) : null;

    if (row.relation === 'match' || row.relation === 'partial_quantity') {
      const id = bucketCounter++;
      if (reqKey) buckets.set(reqKey, id);
      if (offerKey) buckets.set(offerKey, id);
      if (reqKey && offerKey) offerToRequest.set(offerKey, reqKey);
    } else if (row.relation === 'extra' && offerKey) {
      buckets.set(offerKey, bucketCounter++);
    } else if (row.relation === 'missing_from_offer' && reqKey) {
      buckets.set(reqKey, bucketCounter++);
    }
  }

  return { rows, buckets, bucketCount: bucketCounter, offerToRequest };
}

export function bucketFor(text: string, table: MatchTable): number | null {
  const norm = normalize(text);
  if (table.buckets.has(norm)) return table.buckets.get(norm)!;

  for (const [key, id] of table.buckets.entries()) {
    if (norm.startsWith(key) || key.startsWith(norm)) return id;
  }
  return null;
}

export function lookupRequestMatch(offerDesc: string, table: MatchTable): string | null {
  const norm = normalize(offerDesc);
  if (table.offerToRequest.has(norm)) return table.offerToRequest.get(norm)!;
  for (const [key, val] of table.offerToRequest.entries()) {
    if (norm.startsWith(key) || key.startsWith(norm)) return val;
  }
  return null;
}

export function relationForOffer(offerDesc: string, table: MatchTable): GuideRelation {
  const norm = normalize(offerDesc);
  for (const row of table.rows) {
    if (!row.offerDesc) continue;
    const k = normalize(row.offerDesc);
    if (k === norm || norm.startsWith(k) || k.startsWith(norm)) return row.relation;
  }
  return 'extra';
}

export function normKey(text: string): string {
  return normalize(text);
}
