import 'server-only';
import type { OfferStatus, Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

export type ReconciliationsSort = 'recent' | 'coverage_desc' | 'cost_desc';

export interface ReconciliationsListFilters {
  requestId?: number;
  supplier?: string;
  statuses?: readonly OfferStatus[];
  sort?: ReconciliationsSort;
}

export interface ReconciliationListItem {
  reconciliationId: number;
  offerId: number;
  offerStatus: OfferStatus;
  supplierName: string | null;
  sourceFile: string;
  requestId: number;
  requestExternalId: string;
  requestTitle: string;
  offerDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  itemsMatched: number;
  itemsPartial: number;
  itemsMissing: number;
  itemsExtra: number;
  itemsLowConfidence: number;
  itemsRequestTotal: number;
  coveragePct: number;
  totalCostUsd: number;
}

export async function listReconciliations(
  filters: ReconciliationsListFilters = {},
): Promise<ReconciliationListItem[]> {
  const where: Prisma.ReconciliationWhereInput = {};
  if (filters.requestId !== undefined) where.requestId = filters.requestId;
  if (filters.supplier) {
    where.offer = { is: { supplierName: { contains: filters.supplier } } };
  }
  if (filters.statuses && filters.statuses.length > 0) {
    where.offer = {
      is: { ...(where.offer?.is ?? {}), status: { in: [...filters.statuses] } },
    };
  }

  const rows = await prisma.reconciliation.findMany({
    where,
    include: {
      offer: {
        select: {
          id: true,
          status: true,
          supplierName: true,
          sourceFile: true,
          offerDate: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const requestIds = Array.from(new Set(rows.map((r) => r.requestId)));
  const requests = await prisma.purchaseRequest.findMany({
    where: { id: { in: requestIds } },
    select: {
      id: true,
      externalId: true,
      title: true,
      _count: { select: { items: true } },
    },
  });
  const requestById = new Map(requests.map((r) => [r.id, r]));

  const items: ReconciliationListItem[] = rows.map((r) => {
    const req = requestById.get(r.requestId);
    const totalRequest = req?._count.items ?? 0;
    const matched = r.itemsCovered + r.itemsPartial;
    const coveragePct = totalRequest > 0 ? (matched / totalRequest) * 100 : 0;
    return {
      reconciliationId: r.id,
      offerId: r.offerId,
      offerStatus: r.offer.status,
      supplierName: r.offer.supplierName,
      sourceFile: r.offer.sourceFile,
      requestId: r.requestId,
      requestExternalId: req?.externalId ?? '',
      requestTitle: req?.title ?? '',
      offerDate: r.offer.offerDate,
      completedAt: r.completedAt,
      createdAt: r.createdAt,
      itemsMatched: r.itemsCovered,
      itemsPartial: r.itemsPartial,
      itemsMissing: r.itemsMissing,
      itemsExtra: r.itemsExtra,
      itemsLowConfidence: r.itemsLowConfidence,
      itemsRequestTotal: totalRequest,
      coveragePct,
      totalCostUsd: Number(r.totalCostUsd),
    };
  });

  const sort = filters.sort ?? 'recent';
  if (sort === 'coverage_desc') {
    items.sort((a, b) => b.coveragePct - a.coveragePct);
  } else if (sort === 'cost_desc') {
    items.sort((a, b) => b.totalCostUsd - a.totalCostUsd);
  }
  return items;
}
