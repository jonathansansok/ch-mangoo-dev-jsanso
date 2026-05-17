import { prisma } from '@/infra/db/prisma';
import type { Prisma } from '@prisma/client';
import { parseTraceabilityFilters } from '../filters';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filters = parseTraceabilityFilters(url);

  const where: Prisma.DecisionLogWhereInput = {};
  if (filters.kinds && filters.kinds.length > 0) where.kind = { in: [...filters.kinds] };
  if (filters.model) where.model = filters.model;
  if (filters.offerId !== undefined) where.offerId = filters.offerId;
  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = filters.from;
    if (filters.to) where.createdAt.lte = filters.to;
  }

  const rows = await prisma.decisionLog.findMany({
    where,
    orderBy: { id: 'desc' },
  });

  const payload = rows.map((r) => ({
    id: r.id.toString(),
    offerId: r.offerId,
    reconciliationLineId: r.reconciliationLineId,
    kind: r.kind,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    costUsd: Number(r.costUsd),
    durationMs: r.durationMs,
    createdAt: r.createdAt.toISOString(),
    prompt: r.prompt,
    rawResponse: r.rawResponse,
    candidatesConsidered: r.candidatesConsidered,
  }));

  const filename = `traceability-global-${Date.now()}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
