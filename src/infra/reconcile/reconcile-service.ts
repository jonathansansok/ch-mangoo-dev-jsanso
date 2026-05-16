import 'server-only';
import { Prisma, type LineRelation, type OfferStatus } from '@prisma/client';
import pLimit from 'p-limit';
import { prisma } from '@/infra/db/prisma';
import { callChat } from '@/infra/ai/call-chat';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { shortlistFor, type Candidate } from '@/core/reconcile/shortlist';
import { runVerifiers, type VerifierFlag } from '@/core/reconcile/verifiers';
import { unitsCompatible } from '@/lib/normalize-text';
import { JudgeOutput, type JudgeDecision } from '@/core/reconcile/judge-schema';
import {
  buildJudgeUserPrompt,
  JUDGE_SYSTEM_PROMPT,
  type JudgeOfferItemPrompt,
} from '@/core/reconcile/judge-prompts';
import { resolveConflicts, type ResolvableDecision } from '@/core/reconcile/conflict-resolution';
import { embedOfferItems, embedRequestItems } from './embed-items';

const JUDGE_CONCURRENCY = 5;

export class ReconcileError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'ReconcileError';
  }
}

interface ReconcileTotals {
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export async function reconcileOffer(offerId: number): Promise<void> {
  const log = logger.child({ offerId });
  log.info('[reconcile] start');

  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: {
      items: { orderBy: { lineNumber: 'asc' } },
      request: { include: { items: { orderBy: { externalItemId: 'asc' } } } },
    },
  });

  if (offer.items.length === 0) {
    throw new ReconcileError('Oferta sin items', 'no_offer_items');
  }
  if (offer.request.items.length === 0) {
    throw new ReconcileError('Solicitud sin items', 'request_has_no_items');
  }

  await setOfferStatusRaw(offerId, 'RECONCILING');

  const reconciliation = await prisma.reconciliation.upsert({
    where: { offerId },
    create: { offerId, requestId: offer.requestId },
    update: { completedAt: null, summary: null },
  });

  await prisma.reconciliationLine.deleteMany({ where: { reconciliationId: reconciliation.id } });

  log.info(
    { offerItems: offer.items.length, requestItems: offer.request.items.length },
    '[reconcile] embedding items',
  );

  const [reqEmbed, offerEmbed] = await Promise.all([
    embedRequestItems(
      offer.request.items.map((it) => ({
        id: it.id,
        description: it.description,
        unit: it.unit,
      })),
      offerId,
    ),
    embedOfferItems(
      offer.items.map((it) => ({
        id: it.id,
        description: it.description,
        unit: it.unit,
      })),
      offerId,
    ),
  ]);

  const totals: ReconcileTotals = {
    promptTokens: reqEmbed.promptTokens + offerEmbed.promptTokens,
    completionTokens: 0,
    costUsd: reqEmbed.costUsd + offerEmbed.costUsd,
  };

  const requestById = new Map(offer.request.items.map((it) => [it.id, it]));
  const offerById = new Map(offer.items.map((it) => [it.id, it]));

  log.info({ k: env.SHORTLIST_K }, '[reconcile] building shortlists');
  const shortlists = new Map<number, Candidate[]>();
  for (const oe of offerEmbed.embeddings) {
    const candidates = shortlistFor(oe.vector, reqEmbed.embeddings, env.SHORTLIST_K);
    shortlists.set(oe.id, candidates);
  }

  const batches = chunk(offer.items, env.JUDGE_BATCH_SIZE);
  log.info({ batches: batches.length, batchSize: env.JUDGE_BATCH_SIZE }, '[reconcile] judging');

  const limit = pLimit(JUDGE_CONCURRENCY);
  const batchResults = await Promise.all(
    batches.map((batch, idx) =>
      limit(() => judgeBatch(batch, shortlists, requestById, offerId, idx)),
    ),
  );

  const rawDecisions: ResolvableDecision[] = [];
  for (const br of batchResults) {
    totals.promptTokens += br.promptTokens;
    totals.completionTokens += br.completionTokens;
    totals.costUsd += br.costUsd;
    rawDecisions.push(...br.decisions);
  }

  const resolved = resolveConflicts(rawDecisions);
  log.info({ decisions: resolved.length }, '[reconcile] conflicts resolved');

  const assignedRequestIds = new Set(
    resolved
      .filter(
        (d) =>
          d.requestItemId !== null && (d.relation === 'match' || d.relation === 'partial_quantity'),
      )
      .map((d) => d.requestItemId as number),
  );

  const missingLines: Prisma.ReconciliationLineCreateManyInput[] = offer.request.items
    .filter((it) => !assignedRequestIds.has(it.id))
    .map((it) => ({
      reconciliationId: reconciliation.id,
      offerItemId: null,
      requestItemId: it.id,
      relation: 'MISSING_FROM_OFFER' as LineRelation,
      confidence: 1.0,
      embeddingSimilarity: null,
      quantityRequested: it.quantity,
      quantityOffered: null,
      rationale: 'No incluido en esta oferta',
    }));

  const offerLines: Prisma.ReconciliationLineCreateManyInput[] = resolved.map((d) => {
    const offerItem = offerById.get(d.offerItemId)!;
    const requestItem = d.requestItemId !== null ? requestById.get(d.requestItemId) : undefined;
    const similarity = lookupSimilarity(shortlists, d.offerItemId, d.requestItemId);
    const flags = lookupFlags(d.offerItemId, shortlists, offer, d);
    return {
      reconciliationId: reconciliation.id,
      offerItemId: d.offerItemId,
      requestItemId: d.requestItemId,
      relation: mapRelation(d.relation),
      confidence: d.confidence,
      embeddingSimilarity: similarity,
      quantityRequested: requestItem?.quantity ?? null,
      quantityOffered: offerItem.quantity ?? null,
      rationale: d.rationale,
      ...(flags !== null && { flags: flags as Prisma.InputJsonValue }),
    };
  });

  await prisma.$transaction([
    prisma.reconciliationLine.createMany({ data: [...offerLines, ...missingLines] }),
    prisma.reconciliation.update({
      where: { id: reconciliation.id },
      data: {
        itemsCovered: countBy(
          resolved,
          (r) => r.relation === 'match' || r.relation === 'partial_quantity',
        ),
        itemsMissing: missingLines.length,
        itemsExtra: countBy(resolved, (r) => r.relation === 'extra'),
        itemsPartial: countBy(resolved, (r) => r.relation === 'partial_quantity'),
        itemsLowConfidence: countBy(resolved, (r) => r.relation === 'low_confidence'),
        totalPromptTokens: totals.promptTokens,
        totalCompletionTokens: totals.completionTokens,
        totalCostUsd: totals.costUsd,
        completedAt: new Date(),
      },
    }),
    prisma.offer.update({ where: { id: offerId }, data: { status: 'RECONCILED' } }),
  ]);

  log.info(
    {
      covered: countBy(
        resolved,
        (r) => r.relation === 'match' || r.relation === 'partial_quantity',
      ),
      missing: missingLines.length,
      extra: countBy(resolved, (r) => r.relation === 'extra'),
      lowConfidence: countBy(resolved, (r) => r.relation === 'low_confidence'),
      costUsd: totals.costUsd,
    },
    '[reconcile] done → RECONCILED',
  );
}

interface BatchResult {
  decisions: ResolvableDecision[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

interface BatchItem {
  id: number;
  description: string;
  unit: string | null;
  quantity: Prisma.Decimal | null;
}

interface ReqItem {
  id: number;
  description: string;
  unit: string;
  quantity: Prisma.Decimal;
}

async function judgeBatch(
  batch: readonly BatchItem[],
  shortlists: Map<number, Candidate[]>,
  requestById: Map<number, ReqItem>,
  offerId: number,
  batchIdx: number,
): Promise<BatchResult> {
  const refToOfferId = new Map<string, number>();
  const refToRequestId = new Map<string, number>();

  const prompts: JudgeOfferItemPrompt[] = batch.map((item, idx) => {
    const offerRef = `O${idx + 1}`;
    refToOfferId.set(offerRef, item.id);
    const shortlist = shortlists.get(item.id) ?? [];
    const candidates = shortlist.map((c, cidx) => {
      const reqItem = requestById.get(c.id)!;
      const ref = `${offerRef}R${cidx + 1}`;
      refToRequestId.set(ref, c.id);
      return {
        ref,
        description: reqItem.description,
        unit: reqItem.unit,
        quantity: Number(reqItem.quantity),
        score: c.similarity,
      };
    });
    return {
      ref: offerRef,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity !== null ? Number(item.quantity) : null,
      candidates,
    };
  });

  try {
    const result = await callChat({
      kind: 'JUDGE_BATCH',
      offerId,
      model: env.JUDGE_MODEL,
      systemPrompt: JUDGE_SYSTEM_PROMPT,
      userPrompt: buildJudgeUserPrompt(prompts),
      outputSchema: JudgeOutput,
      candidatesConsidered: {
        batchIdx,
        items: prompts.map((p) => ({
          ref: p.ref,
          candidates: p.candidates.map((c) => ({ ref: c.ref, score: c.score })),
        })),
      },
    });
    logger.info(
      { offerId, batchIdx, decisions: result.data.decisions.length, costUsd: result.costUsd },
      '[reconcile] batch ok',
    );

    const decisions = result.data.decisions
      .map((d) => toResolvable(d, refToOfferId, refToRequestId, shortlists, requestById))
      .filter((d): d is ResolvableDecision => d !== null);

    return {
      decisions,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
    };
  } catch (err) {
    logger.error(
      { offerId, batchIdx, err: (err as Error).message },
      '[reconcile] batch failed, low_confidence',
    );
    return {
      decisions: batch.map((item) => ({
        offerItemId: item.id,
        requestItemId: null,
        relation: 'low_confidence' as const,
        confidence: 0,
        rationale: 'Model output invalid',
      })),
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
  }
}

function toResolvable(
  decision: JudgeDecision,
  refToOfferId: Map<string, number>,
  refToRequestId: Map<string, number>,
  shortlists: Map<number, Candidate[]>,
  requestById: Map<number, ReqItem>,
): ResolvableDecision | null {
  const offerItemId = refToOfferId.get(decision.offerItemRef);
  if (offerItemId === undefined) return null;

  let requestItemId: number | null = null;
  if (decision.requestItemRef !== null) {
    requestItemId = refToRequestId.get(decision.requestItemRef) ?? null;
  }

  let relation: ResolvableDecision['relation'] = decision.relation;

  if ((relation === 'match' || relation === 'partial_quantity') && requestItemId !== null) {
    const candidate = shortlists.get(offerItemId)?.find((c) => c.id === requestItemId);
    const requestItem = requestById.get(requestItemId);
    const verifier = runVerifiers(
      {
        similarity: candidate?.similarity ?? null,
        quantityOffered: null,
        quantityRequested: requestItem ? Number(requestItem.quantity) : null,
        unitOffered: null,
        unitRequested: requestItem?.unit ?? null,
      },
      {
        minSimilarity: env.MIN_SIMILARITY,
        qtyRatioMin: env.QTY_RATIO_MIN,
        qtyRatioMax: env.QTY_RATIO_MAX,
      },
    );
    if (verifier.shouldDowngradeToLowConfidence) {
      relation = 'low_confidence';
    }
  }

  return {
    offerItemId,
    requestItemId,
    relation,
    confidence: decision.confidence,
    rationale: decision.rationale_short,
  };
}

function mapRelation(rel: ResolvableDecision['relation']): LineRelation {
  switch (rel) {
    case 'match':
      return 'MATCH';
    case 'partial_quantity':
      return 'PARTIAL_QUANTITY';
    case 'extra':
      return 'EXTRA';
    case 'low_confidence':
      return 'LOW_CONFIDENCE';
  }
}

function lookupSimilarity(
  shortlists: Map<number, Candidate[]>,
  offerItemId: number,
  requestItemId: number | null,
): Prisma.Decimal | null {
  if (requestItemId === null) return null;
  const cand = shortlists.get(offerItemId)?.find((c) => c.id === requestItemId);
  return cand ? new Prisma.Decimal(cand.similarity.toFixed(3)) : null;
}

function lookupFlags(
  offerItemId: number,
  shortlists: Map<number, Candidate[]>,
  offer: { items: BatchItem[]; request: { items: ReqItem[] } },
  d: ResolvableDecision,
): { flags: VerifierFlag[] } | null {
  if (d.requestItemId === null) return null;
  const offerItem = offer.items.find((i) => i.id === offerItemId);
  const requestItem = offer.request.items.find((i) => i.id === d.requestItemId);
  if (!offerItem || !requestItem) return null;
  const cand = shortlists.get(offerItemId)?.find((c) => c.id === d.requestItemId);
  const verifier = runVerifiers(
    {
      similarity: cand?.similarity ?? null,
      quantityOffered: offerItem.quantity !== null ? Number(offerItem.quantity) : null,
      quantityRequested: Number(requestItem.quantity),
      unitOffered: offerItem.unit,
      unitRequested: requestItem.unit,
    },
    {
      minSimilarity: env.MIN_SIMILARITY,
      qtyRatioMin: env.QTY_RATIO_MIN,
      qtyRatioMax: env.QTY_RATIO_MAX,
    },
  );
  if (!unitsCompatible(offerItem.unit, requestItem.unit)) {
    verifier.flags.push('unit_mismatch');
  }
  return verifier.flags.length > 0 ? { flags: verifier.flags } : null;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function countBy<T>(arr: readonly T[], pred: (t: T) => boolean): number {
  return arr.reduce((acc, x) => acc + (pred(x) ? 1 : 0), 0);
}

async function setOfferStatusRaw(offerId: number, status: OfferStatus): Promise<void> {
  await prisma.offer.update({ where: { id: offerId }, data: { status, failureReason: null } });
}
