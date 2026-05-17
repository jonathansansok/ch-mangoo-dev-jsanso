import 'server-only';
import type { DecisionKind, Prisma } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

export interface TraceabilityListFilters {
  kinds?: readonly DecisionKind[];
  model?: string;
  offerId?: number;
  from?: Date;
  to?: Date;
  take?: number;
  cursor?: string;
}

export interface DecisionLogListItem {
  id: string;
  offerId: number | null;
  reconciliationLineId: number | null;
  kind: DecisionKind;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: Date;
}

export interface DecisionLogListPage {
  items: DecisionLogListItem[];
  nextCursor: string | null;
}

const DEFAULT_TAKE = 100;
const MAX_TAKE = 500;

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

export async function listDecisionLogs(
  filters: TraceabilityListFilters = {},
): Promise<DecisionLogListPage> {
  const take = Math.min(filters.take ?? DEFAULT_TAKE, MAX_TAKE);
  const where = buildWhere(filters);
  const cursorId = filters.cursor ? BigInt(filters.cursor) : undefined;

  const rows = await prisma.decisionLog.findMany({
    where,
    orderBy: { id: 'desc' },
    take: take + 1,
    ...(cursorId !== undefined && { cursor: { id: cursorId }, skip: 1 }),
    select: {
      id: true,
      offerId: true,
      reconciliationLineId: true,
      kind: true,
      model: true,
      promptTokens: true,
      completionTokens: true,
      costUsd: true,
      durationMs: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;

  return {
    items: slice.map((r) => ({
      id: r.id.toString(),
      offerId: r.offerId,
      reconciliationLineId: r.reconciliationLineId,
      kind: r.kind,
      model: r.model,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      costUsd: Number(r.costUsd),
      durationMs: r.durationMs,
      createdAt: r.createdAt,
    })),
    nextCursor: hasMore ? slice[slice.length - 1]!.id.toString() : null,
  };
}

export async function listAllDecisionLogs(
  filters: TraceabilityListFilters,
): Promise<DecisionLogListItem[]> {
  const all: DecisionLogListItem[] = [];
  let cursor: string | undefined;
  do {
    const next: TraceabilityListFilters = { ...filters, take: MAX_TAKE };
    if (cursor !== undefined) next.cursor = cursor;
    const page = await listDecisionLogs(next);
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

export interface DecisionLogDetail extends DecisionLogListItem {
  prompt: string;
  rawResponse: string;
  candidatesConsidered: unknown;
}

export async function getDecisionLogDetail(id: string): Promise<DecisionLogDetail | null> {
  const row = await prisma.decisionLog.findUnique({ where: { id: BigInt(id) } });
  if (!row) return null;
  return {
    id: row.id.toString(),
    offerId: row.offerId,
    reconciliationLineId: row.reconciliationLineId,
    kind: row.kind,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    costUsd: Number(row.costUsd),
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    prompt: row.prompt,
    rawResponse: row.rawResponse,
    candidatesConsidered: row.candidatesConsidered,
  };
}

export async function listDistinctModels(offerId?: number): Promise<string[]> {
  const where = offerId !== undefined ? { offerId } : {};
  const rows = await prisma.decisionLog.findMany({
    where,
    select: { model: true },
    distinct: ['model'],
    orderBy: { model: 'asc' },
  });
  return rows.map((r) => r.model);
}

export async function listOffersWithLogs(): Promise<
  Array<{ id: number; sourceFile: string; supplierName: string | null }>
> {
  const offers = await prisma.offer.findMany({
    where: { decisionLogs: { some: {} } },
    select: { id: true, sourceFile: true, supplierName: true },
    orderBy: { createdAt: 'desc' },
  });
  return offers;
}
