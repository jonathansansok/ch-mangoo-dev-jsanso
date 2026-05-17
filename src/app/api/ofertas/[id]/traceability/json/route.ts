import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = Number(id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return new Response('Invalid id', { status: 400 });
  }

  const rows = await prisma.decisionLog.findMany({
    where: { offerId },
    orderBy: { createdAt: 'asc' },
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

  const filename = `traceability-${offerId}-${Date.now()}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
