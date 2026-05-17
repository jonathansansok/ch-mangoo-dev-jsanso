import 'server-only';
import type { DecisionKind, Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import type { TraceabilityListFilters } from './traceability-list';

export interface TraceabilityAggregate {
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  uniqueOffers: number;
  avgCostPerOfferUsd: number;
  byKind: Record<DecisionKind, number>;
}

function buildWhere(filters: TraceabilityListFilters): Prisma.DecisionLogWhereInput {
  const where: Prisma.DecisionLogWhereInput = {};
  if (filters.kinds && filters.kinds.length > 0) where.kind = { in: [...filters.kinds] };
  if (filters.model) where.model = filters.model;
  if (filters.offerId !== undefined) where.offerId = filters.offerId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }
  return where;
}

export async function aggregateDecisionLogs(
  filters: TraceabilityListFilters = {},
): Promise<TraceabilityAggregate> {
  const where = buildWhere(filters);

  const [agg, byKindRows, distinctOffers] = await Promise.all([
    prisma.decisionLog.aggregate({
      where,
      _count: { id: true },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        costUsd: true,
        durationMs: true,
      },
    }),
    prisma.decisionLog.groupBy({ by: ['kind'], where, _count: { _all: true } }),
    prisma.decisionLog.findMany({
      where: { ...where, offerId: { not: null } },
      select: { offerId: true },
      distinct: ['offerId'],
    }),
  ]);

  const byKind: Record<DecisionKind, number> = {
    EXTRACT_HEADER: 0,
    EXTRACT_ITEMS: 0,
    EMBED_REQUEST: 0,
    EMBED_OFFER: 0,
    JUDGE_BATCH: 0,
  };
  for (const row of byKindRows) {
    byKind[row.kind] = row._count._all;
  }

  const uniqueOffers = distinctOffers.length;
  const totalCost = Number(agg._sum.costUsd ?? 0);

  return {
    totalCalls: agg._count.id,
    totalPromptTokens: agg._sum.promptTokens ?? 0,
    totalCompletionTokens: agg._sum.completionTokens ?? 0,
    totalCostUsd: totalCost,
    totalDurationMs: agg._sum.durationMs ?? 0,
    uniqueOffers,
    avgCostPerOfferUsd: uniqueOffers > 0 ? totalCost / uniqueOffers : 0,
    byKind,
  };
}
