import type { DecisionKind } from '@prisma/client';
import type { TraceabilityListFilters } from '@/core/queries/traceability-list';

const VALID_KINDS: ReadonlySet<DecisionKind> = new Set([
  'EXTRACT_HEADER',
  'EXTRACT_ITEMS',
  'EMBED_REQUEST',
  'EMBED_OFFER',
  'JUDGE_BATCH',
]);

export function parseTraceabilityFilters(url: URL): TraceabilityListFilters {
  const filters: TraceabilityListFilters = {};

  const kindsParam = url.searchParams.get('kinds');
  if (kindsParam) {
    const kinds = kindsParam
      .split(',')
      .map((k) => k.trim())
      .filter((k): k is DecisionKind => VALID_KINDS.has(k as DecisionKind));
    if (kinds.length > 0) filters.kinds = kinds;
  }

  const model = url.searchParams.get('model');
  if (model) filters.model = model;

  const offerId = url.searchParams.get('offerId');
  if (offerId) {
    const n = Number(offerId);
    if (Number.isInteger(n) && n > 0) filters.offerId = n;
  }

  const from = url.searchParams.get('from');
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) filters.from = d;
  }

  const to = url.searchParams.get('to');
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) filters.to = d;
  }

  return filters;
}
