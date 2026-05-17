import type { DecisionKind } from '@prisma/client';
import type { TraceabilityListFilters } from '@/core/queries/traceability-list';

const VALID_KINDS: ReadonlySet<DecisionKind> = new Set([
  'EXTRACT_HEADER',
  'EXTRACT_ITEMS',
  'EMBED_REQUEST',
  'EMBED_OFFER',
  'JUDGE_BATCH',
]);

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): TraceabilityListFilters {
  const out: TraceabilityListFilters = {};

  const kinds = searchParams.kinds;
  if (typeof kinds === 'string') {
    const arr = kinds
      .split(',')
      .map((k) => k.trim())
      .filter((k): k is DecisionKind => VALID_KINDS.has(k as DecisionKind));
    if (arr.length > 0) out.kinds = arr;
  }

  const model = searchParams.model;
  if (typeof model === 'string' && model.trim()) out.model = model.trim();

  const offerId = searchParams.offerId;
  if (typeof offerId === 'string') {
    const n = Number(offerId);
    if (Number.isInteger(n) && n > 0) out.offerId = n;
  }

  const from = searchParams.from;
  if (typeof from === 'string') {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) out.from = d;
  }

  const to = searchParams.to;
  if (typeof to === 'string') {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) out.to = d;
  }

  const cursor = searchParams.cursor;
  if (typeof cursor === 'string' && /^\d+$/.test(cursor)) out.cursor = cursor;

  return out;
}

export function filtersToQueryString(filters: TraceabilityListFilters): string {
  const sp = new URLSearchParams();
  if (filters.kinds?.length) sp.set('kinds', filters.kinds.join(','));
  if (filters.model) sp.set('model', filters.model);
  if (filters.offerId !== undefined) sp.set('offerId', String(filters.offerId));
  if (filters.from) sp.set('from', filters.from.toISOString());
  if (filters.to) sp.set('to', filters.to.toISOString());
  return sp.toString();
}
