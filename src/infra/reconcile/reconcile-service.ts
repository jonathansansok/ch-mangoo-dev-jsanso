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
import { JudgeOutput } from '@/core/reconcile/judge-schema';
import {
  buildJudgeUserPrompt,
  JUDGE_SYSTEM_PROMPT,
  type JudgeOfferItemPrompt,
} from '@/core/reconcile/judge-prompts';
import { resolveConflicts, type ResolvableDecision } from '@/core/reconcile/conflict-resolution';
import { resolveDecision, type ResolveRequestItem } from '@/core/reconcile/resolve-decision';
import { embedOfferItems, embedRequestItems } from './embed-items';
import {
  applyRecoveries,
  runReversePass,
  type ReverseExtraItem,
  type ReverseRequestItem,
} from './reverse-pass';

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
    update: { completedAt: null, summary: null, batchesTotal: 0, batchesDone: 0 },
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

  log.info(
    {
      k: env.SHORTLIST_K,
      offerItems: offerEmbed.embeddings.length,
      requestItems: reqEmbed.embeddings.length,
    },
    '[reconcile] building forward shortlists',
  );
  const shortlists = new Map<number, Candidate[]>();
  let lowSimCount = 0;
  for (const oe of offerEmbed.embeddings) {
    const candidates = shortlistFor(oe.vector, reqEmbed.embeddings, env.SHORTLIST_K);
    shortlists.set(oe.id, candidates);
    if ((candidates[0]?.similarity ?? 0) < env.MIN_SIMILARITY) lowSimCount += 1;
  }
  log.info(
    {
      shortlistsBuilt: shortlists.size,
      offersWithTopBelowMinSim: lowSimCount,
      minSim: env.MIN_SIMILARITY,
    },
    '[reconcile] shortlists ready',
  );

  const batches = chunk(offer.items, env.JUDGE_BATCH_SIZE);
  log.info({ batches: batches.length, batchSize: env.JUDGE_BATCH_SIZE }, '[reconcile] judging');

  await prisma.reconciliation.update({
    where: { id: reconciliation.id },
    data: { batchesTotal: batches.length },
  });

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

  const forwardBreakdown = {
    total: rawDecisions.length,
    match: rawDecisions.filter((d) => d.relation === 'match').length,
    partial: rawDecisions.filter((d) => d.relation === 'partial_quantity').length,
    extra: rawDecisions.filter((d) => d.relation === 'extra').length,
    lowConfidence: rawDecisions.filter((d) => d.lowConfidence).length,
  };
  log.info(forwardBreakdown, '[reconcile] forward judge raw decisions');

  const extrasDecisions = rawDecisions.filter((d) => d.relation === 'extra');
  if (extrasDecisions.length > 0) {
    log.info(
      {
        count: extrasDecisions.length,
        examples: extrasDecisions.slice(0, 10).map((d) => {
          const offerItem = offerById.get(d.offerItemId);
          const top = shortlists.get(d.offerItemId)?.slice(0, 3) ?? [];
          return {
            offered: offerItem?.description.slice(0, 60),
            top3Candidates: top.map((c) => ({
              req: requestById.get(c.id)?.description.slice(0, 50),
              sim: Number(c.similarity.toFixed(3)),
            })),
            rationale: d.rationale.slice(0, 80),
          };
        }),
      },
      '[reconcile] EXTRAS post-forward — judge dijo extra teniendo estos candidatos',
    );
  }

  let resolved = resolveConflicts(rawDecisions);
  log.info({ decisions: resolved.length }, '[reconcile] conflicts resolved (forward)');

  const initialAssigned = new Set(
    resolved
      .filter((d) => d.requestItemId !== null && d.relation !== 'extra')
      .map((d) => d.requestItemId as number),
  );

  const unassignedRequests: ReverseRequestItem[] = offer.request.items
    .filter((it) => !initialAssigned.has(it.id))
    .map((it) => {
      const emb = reqEmbed.embeddings.find((e) => e.id === it.id);
      return {
        id: it.id,
        description: it.description,
        unit: it.unit,
        quantity: Number(it.quantity),
        vector: emb?.vector ?? [],
      };
    })
    .filter((r) => r.vector.length > 0);

  const extraOfferIds = new Set(
    resolved.filter((d) => d.relation === 'extra').map((d) => d.offerItemId),
  );
  const extras: ReverseExtraItem[] = offer.items
    .filter((it) => extraOfferIds.has(it.id))
    .map((it) => {
      const emb = offerEmbed.embeddings.find((e) => e.id === it.id);
      return {
        offerItemId: it.id,
        description: it.description,
        unit: it.unit,
        quantity: it.quantity !== null ? Number(it.quantity) : null,
        vector: emb?.vector ?? [],
      };
    })
    .filter((e) => e.vector.length > 0);

  log.info(
    { unassigned: unassignedRequests.length, extras: extras.length },
    '[reconcile] running reverse pass',
  );

  const reverseResult = await runReversePass({
    unassignedRequests,
    extras,
    offerId,
  });
  totals.promptTokens += reverseResult.promptTokens;
  totals.completionTokens += reverseResult.completionTokens;
  totals.costUsd += reverseResult.costUsd;

  const recoverySimilarityByOfferId = new Map<number, number>();
  if (reverseResult.recoveries.length > 0) {
    resolved = applyRecoveries(resolved, reverseResult.recoveries);
    for (const r of reverseResult.recoveries) {
      recoverySimilarityByOfferId.set(r.offerItemId, r.similarity);
    }
    log.info(
      {
        recovered: reverseResult.recoveries.length,
        examples: reverseResult.recoveries.slice(0, 5).map((r) => ({
          offerItemId: r.offerItemId,
          requestItemId: r.requestItemId,
          relation: r.relation,
          similarity: Number(r.similarity.toFixed(3)),
        })),
      },
      '[reconcile] reverse pass recovered matches',
    );
  }

  const assignedRequestIds = new Set(
    resolved
      .filter((d) => d.requestItemId !== null && d.relation !== 'extra')
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
    const similarity = lookupSimilarity(
      shortlists,
      d.offerItemId,
      d.requestItemId,
      recoverySimilarityByOfferId,
    );
    const flags = lookupFlags(d.offerItemId, shortlists, offer, d);
    return {
      reconciliationId: reconciliation.id,
      offerItemId: d.offerItemId,
      requestItemId: d.requestItemId,
      relation: mapRelation(d.relation),
      confidence: d.confidence,
      lowConfidence: d.lowConfidence,
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
        itemsCovered: countBy(resolved, (r) => r.relation === 'match' && !r.lowConfidence),
        itemsMissing: missingLines.length,
        itemsExtra: countBy(resolved, (r) => r.relation === 'extra' && !r.lowConfidence),
        itemsPartial: countBy(
          resolved,
          (r) => r.relation === 'partial_quantity' && !r.lowConfidence,
        ),
        itemsLowConfidence: countBy(resolved, (r) => r.lowConfidence),
        totalPromptTokens: totals.promptTokens,
        totalCompletionTokens: totals.completionTokens,
        totalCostUsd: totals.costUsd,
        completedAt: new Date(),
      },
    }),
    prisma.offer.update({ where: { id: offerId }, data: { status: 'RECONCILED' } }),
  ]);

  const summary = {
    match: countBy(resolved, (r) => r.relation === 'match' && !r.lowConfidence),
    partial: countBy(resolved, (r) => r.relation === 'partial_quantity' && !r.lowConfidence),
    extra: countBy(resolved, (r) => r.relation === 'extra' && !r.lowConfidence),
    lowConfidence: countBy(resolved, (r) => r.lowConfidence),
    missing: missingLines.length,
    requestItems: offer.request.items.length,
  };
  log.info(
    {
      ...summary,
      sumCheck: summary.match + summary.partial + summary.missing,
      costUsd: totals.costUsd,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
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

    const resolveReqById = new Map<number, ResolveRequestItem>(
      [...requestById.entries()].map(([id, it]) => [
        id,
        { quantity: Number(it.quantity), unit: it.unit },
      ]),
    );
    const decisions = result.data.decisions
      .map((d) =>
        resolveDecision(d, {
          refToOfferId,
          refToRequestId,
          shortlists,
          requestById: resolveReqById,
          verifierConfig: {
            minSimilarity: env.MIN_SIMILARITY,
            qtyRatioMin: env.QTY_RATIO_MIN,
            qtyRatioMax: env.QTY_RATIO_MAX,
          },
          trustJudgeConfidence: env.TRUST_JUDGE_CONFIDENCE,
        }),
      )
      .filter((d): d is ResolvableDecision => d !== null);

    await bumpBatchesDone(offerId);

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
    await bumpBatchesDone(offerId);
    return {
      decisions: batch.map((item) => ({
        offerItemId: item.id,
        requestItemId: null,
        relation: 'extra' as const,
        confidence: 0,
        lowConfidence: true,
        rationale: 'Model output invalid',
      })),
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
  }
}

async function bumpBatchesDone(offerId: number): Promise<void> {
  try {
    await prisma.reconciliation.update({
      where: { offerId },
      data: { batchesDone: { increment: 1 } },
    });
  } catch (err) {
    logger.warn({ offerId, err: (err as Error).message }, '[reconcile] failed to bump batchesDone');
  }
}

function mapRelation(rel: ResolvableDecision['relation']): LineRelation {
  switch (rel) {
    case 'match':
      return 'MATCH';
    case 'partial_quantity':
      return 'PARTIAL_QUANTITY';
    case 'extra':
      return 'EXTRA';
  }
}

function lookupSimilarity(
  shortlists: Map<number, Candidate[]>,
  offerItemId: number,
  requestItemId: number | null,
  recoverySimilarityByOfferId?: Map<number, number>,
): Prisma.Decimal | null {
  if (requestItemId === null) return null;
  const cand = shortlists.get(offerItemId)?.find((c) => c.id === requestItemId);
  if (cand) return new Prisma.Decimal(cand.similarity.toFixed(3));
  const recovery = recoverySimilarityByOfferId?.get(offerItemId);
  if (recovery !== undefined) return new Prisma.Decimal(recovery.toFixed(3));
  return null;
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
