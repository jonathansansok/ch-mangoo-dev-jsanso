import 'server-only';
import { prisma } from '@/infra/db/prisma';
import { listReconciliations, type ReconciliationsListFilters } from './reconciliations-list';

export interface ReconciliationAggregate {
  totalReconciliations: number;
  totalItemsMatched: number;
  avgCoveragePct: number;
  totalCostUsd: number;
}

export async function aggregateReconciliations(
  filters: ReconciliationsListFilters = {},
): Promise<ReconciliationAggregate> {
  if (filters.requestId === undefined && !filters.supplier && !filters.statuses) {
    const [agg, items] = await Promise.all([
      prisma.reconciliation.aggregate({
        _count: { id: true },
        _sum: { itemsCovered: true, totalCostUsd: true },
      }),
      listReconciliations(filters),
    ]);
    const totalRecs = agg._count.id;
    const avgCoverage =
      items.length > 0 ? items.reduce((sum, it) => sum + it.coveragePct, 0) / items.length : 0;
    return {
      totalReconciliations: totalRecs,
      totalItemsMatched: Number(agg._sum.itemsCovered ?? 0),
      avgCoveragePct: avgCoverage,
      totalCostUsd: Number(agg._sum.totalCostUsd ?? 0),
    };
  }

  const items = await listReconciliations(filters);
  if (items.length === 0) {
    return {
      totalReconciliations: 0,
      totalItemsMatched: 0,
      avgCoveragePct: 0,
      totalCostUsd: 0,
    };
  }
  return {
    totalReconciliations: items.length,
    totalItemsMatched: items.reduce((s, it) => s + it.itemsMatched, 0),
    avgCoveragePct: items.reduce((s, it) => s + it.coveragePct, 0) / items.length,
    totalCostUsd: items.reduce((s, it) => s + it.totalCostUsd, 0),
  };
}
