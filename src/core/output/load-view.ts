import 'server-only';
import { prisma } from '@/infra/db/prisma';
import type { ReconciliationView, ReconciliationViewLine } from './types';

function extractFlags(flags: unknown): string[] {
  if (!flags || typeof flags !== 'object') return [];
  const f = flags as { flags?: unknown };
  return Array.isArray(f.flags) ? (f.flags as string[]) : [];
}

export async function loadReconciliationView(
  reconciliationId: number,
): Promise<ReconciliationView | null> {
  const rec = await prisma.reconciliation.findUnique({
    where: { id: reconciliationId },
    include: {
      offer: true,
      lines: {
        orderBy: { id: 'asc' },
        include: { offerItem: true, requestItem: true },
      },
    },
  });
  if (!rec) return null;

  const [request, decisionAgg, modelsByKind] = await Promise.all([
    prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: rec.requestId },
      select: {
        externalId: true,
        title: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.decisionLog.aggregate({
      where: { offerId: rec.offerId },
      _count: { id: true },
      _sum: { durationMs: true },
    }),
    prisma.decisionLog.findMany({
      where: { offerId: rec.offerId },
      select: { kind: true, model: true },
      distinct: ['kind', 'model'],
    }),
  ]);

  const extractModel =
    modelsByKind.find((m) => m.kind === 'EXTRACT_HEADER' || m.kind === 'EXTRACT_ITEMS')?.model ??
    null;
  const judgeModel = modelsByKind.find((m) => m.kind === 'JUDGE_BATCH')?.model ?? null;
  const embedModel =
    modelsByKind.find((m) => m.kind === 'EMBED_REQUEST' || m.kind === 'EMBED_OFFER')?.model ?? null;

  const lines: ReconciliationViewLine[] = rec.lines.map((l) => ({
    id: l.id,
    relation: l.relation,
    confidence: Number(l.confidence),
    embeddingSimilarity: l.embeddingSimilarity !== null ? Number(l.embeddingSimilarity) : null,
    quantityRequested: l.quantityRequested !== null ? Number(l.quantityRequested) : null,
    quantityOffered: l.quantityOffered !== null ? Number(l.quantityOffered) : null,
    rationale: l.rationale,
    flags: extractFlags(l.flags),
    offerItem: l.offerItem
      ? {
          id: l.offerItem.id,
          lineNumber: l.offerItem.lineNumber,
          description: l.offerItem.description,
          quantity: l.offerItem.quantity !== null ? Number(l.offerItem.quantity) : null,
          unit: l.offerItem.unit,
          unitPrice: l.offerItem.unitPrice !== null ? Number(l.offerItem.unitPrice) : null,
          currency: l.offerItem.currency,
          supplierCode: l.offerItem.supplierCode,
        }
      : null,
    requestItem: l.requestItem
      ? {
          id: l.requestItem.id,
          externalItemId: l.requestItem.externalItemId,
          description: l.requestItem.description,
          quantity: Number(l.requestItem.quantity),
          unit: l.requestItem.unit,
        }
      : null,
  }));

  return {
    id: rec.id,
    offerId: rec.offerId,
    itemsCovered: rec.itemsCovered,
    itemsMissing: rec.itemsMissing,
    itemsExtra: rec.itemsExtra,
    itemsPartial: rec.itemsPartial,
    itemsLowConfidence: rec.itemsLowConfidence,
    totalPromptTokens: rec.totalPromptTokens,
    totalCompletionTokens: rec.totalCompletionTokens,
    totalCostUsd: Number(rec.totalCostUsd),
    decisionLogCount: decisionAgg._count.id,
    createdAt: rec.createdAt,
    completedAt: rec.completedAt,
    offer: {
      id: rec.offer.id,
      supplierName: rec.offer.supplierName,
      offerDate: rec.offer.offerDate,
      sourceFile: rec.offer.sourceFile,
      observations: rec.offer.observations,
      createdAt: rec.offer.createdAt,
    },
    request: {
      externalId: request.externalId,
      title: request.title,
      totalItems: request._count.items,
    },
    models: { extractModel, judgeModel, embedModel },
    durationMs: decisionAgg._sum.durationMs ?? 0,
    lines,
  };
}

export async function loadReconciliationViewByOffer(
  offerId: number,
): Promise<ReconciliationView | null> {
  const rec = await prisma.reconciliation.findUnique({
    where: { offerId },
    select: { id: true },
  });
  if (!rec) return null;
  return loadReconciliationView(rec.id);
}
