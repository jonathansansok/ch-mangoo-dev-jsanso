import type { OfferStatus } from '@prisma/client';
import type {
  ReconciliationsListFilters,
  ReconciliationsSort,
} from '@/core/queries/reconciliations-list';

const VALID_STATUSES: ReadonlySet<OfferStatus> = new Set([
  'PENDING',
  'EXTRACTING',
  'EXTRACTED',
  'RECONCILING',
  'RECONCILED',
  'FAILED',
]);

const VALID_SORTS: ReadonlySet<ReconciliationsSort> = new Set([
  'recent',
  'coverage_desc',
  'cost_desc',
]);

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ReconciliationsListFilters {
  const out: ReconciliationsListFilters = {};

  const requestId = searchParams.requestId;
  if (typeof requestId === 'string') {
    const n = Number(requestId);
    if (Number.isInteger(n) && n > 0) out.requestId = n;
  }

  const supplier = searchParams.supplier;
  if (typeof supplier === 'string' && supplier.trim()) out.supplier = supplier.trim();

  const statuses = searchParams.statuses;
  if (typeof statuses === 'string') {
    const arr = statuses
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is OfferStatus => VALID_STATUSES.has(s as OfferStatus));
    if (arr.length > 0) out.statuses = arr;
  }

  const sort = searchParams.sort;
  if (typeof sort === 'string' && VALID_SORTS.has(sort as ReconciliationsSort)) {
    out.sort = sort as ReconciliationsSort;
  }

  return out;
}
