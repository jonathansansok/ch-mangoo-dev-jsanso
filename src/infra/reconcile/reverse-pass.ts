import 'server-only';
import pLimit from 'p-limit';
import { callChat } from '@/infra/ai/call-chat';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { cosine } from '@/core/reconcile/cosine';
import { JudgeOutput } from '@/core/reconcile/judge-schema';
import {
  buildJudgeUserPrompt,
  JUDGE_SYSTEM_PROMPT,
  type JudgeOfferItemPrompt,
} from '@/core/reconcile/judge-prompts';
import type { ResolvableDecision } from '@/core/reconcile/conflict-resolution';

const REVERSE_BATCH_SIZE = 8;
const REVERSE_CONCURRENCY = 3;

export interface ReverseRequestItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
  vector: ReadonlyArray<number>;
}

export interface ReverseExtraItem {
  offerItemId: number;
  description: string;
  unit: string | null;
  quantity: number | null;
  vector: ReadonlyArray<number>;
}

export interface ReverseRecovery {
  offerItemId: number;
  requestItemId: number;
  relation: 'match' | 'partial_quantity';
  confidence: number;
  rationale: string;
  similarity: number;
}

export interface ReversePassResult {
  recoveries: ReverseRecovery[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export async function runReversePass(args: {
  unassignedRequests: ReadonlyArray<ReverseRequestItem>;
  extras: ReadonlyArray<ReverseExtraItem>;
  offerId: number;
}): Promise<ReversePassResult> {
  const { unassignedRequests, extras, offerId } = args;
  const log = logger.child({ offerId });

  if (unassignedRequests.length === 0 || extras.length === 0) {
    log.info(
      { unassigned: unassignedRequests.length, extras: extras.length },
      '[reverse-pass] skipped (empty side)',
    );
    return { recoveries: [], promptTokens: 0, completionTokens: 0, costUsd: 0 };
  }

  const k = env.REVERSE_PASS_K;
  const minSim = env.REVERSE_PASS_MIN_SIMILARITY;

  log.info(
    {
      unassignedRequests: unassignedRequests.length,
      extras: extras.length,
      k,
      minSim,
    },
    '[reverse-pass] start',
  );

  const usableRequests: Array<{
    request: ReverseRequestItem;
    candidates: Array<{ extra: ReverseExtraItem; similarity: number }>;
  }> = [];

  for (const req of unassignedRequests) {
    const scored = extras
      .map((ex) => ({ extra: ex, similarity: cosine(req.vector, ex.vector) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k)
      .filter((c) => c.similarity >= minSim);
    if (scored.length === 0) continue;
    usableRequests.push({ request: req, candidates: scored });
  }

  const droppedNoCandidate = unassignedRequests.length - usableRequests.length;
  log.info(
    {
      requestsWithCandidates: usableRequests.length,
      droppedNoCandidate,
      avgCandidates:
        usableRequests.length > 0
          ? Math.round(
              (usableRequests.reduce((acc, r) => acc + r.candidates.length, 0) /
                usableRequests.length) *
                10,
            ) / 10
          : 0,
      examplesDropped: unassignedRequests
        .filter((r) => !usableRequests.some((u) => u.request.id === r.id))
        .slice(0, 5)
        .map((r) => r.description.slice(0, 50)),
      examplesUsable: usableRequests.slice(0, 5).map((u) => ({
        req: u.request.description.slice(0, 40),
        topCand: u.candidates[0]?.extra.description.slice(0, 40),
        topSim: Number((u.candidates[0]?.similarity ?? 0).toFixed(3)),
      })),
    },
    '[reverse-pass] shortlists built',
  );

  if (usableRequests.length === 0) {
    return { recoveries: [], promptTokens: 0, completionTokens: 0, costUsd: 0 };
  }

  const batches = chunk(usableRequests, REVERSE_BATCH_SIZE);
  log.info({ batches: batches.length, batchSize: REVERSE_BATCH_SIZE }, '[reverse-pass] judging');

  const limit = pLimit(REVERSE_CONCURRENCY);
  const claimedExtras = new Set<number>();
  const allRecoveries: ReverseRecovery[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let costUsd = 0;

  const batchResults = await Promise.all(
    batches.map((batch, idx) => limit(() => judgeReverseBatch(batch, offerId, idx))),
  );

  for (const br of batchResults) {
    promptTokens += br.promptTokens;
    completionTokens += br.completionTokens;
    costUsd += br.costUsd;
    for (const rec of br.recoveries) {
      if (claimedExtras.has(rec.offerItemId)) {
        log.warn(
          { offerItemId: rec.offerItemId, requestItemId: rec.requestItemId },
          '[reverse-pass] extra already claimed by another request, skipping',
        );
        continue;
      }
      claimedExtras.add(rec.offerItemId);
      allRecoveries.push(rec);
    }
  }

  log.info(
    {
      recoveries: allRecoveries.length,
      costUsd,
      promptTokens,
      completionTokens,
    },
    '[reverse-pass] done',
  );

  return { recoveries: allRecoveries, promptTokens, completionTokens, costUsd };
}

interface BatchInput {
  request: ReverseRequestItem;
  candidates: Array<{ extra: ReverseExtraItem; similarity: number }>;
}

interface BatchResult {
  recoveries: ReverseRecovery[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

async function judgeReverseBatch(
  batch: ReadonlyArray<BatchInput>,
  offerId: number,
  batchIdx: number,
): Promise<BatchResult> {
  const refToRequestId = new Map<string, number>();
  const refToOfferItemId = new Map<string, number>();
  const refSimilarity = new Map<string, number>();

  const prompts: JudgeOfferItemPrompt[] = batch.map((b, idx) => {
    const reqRef = `R${idx + 1}`;
    refToRequestId.set(reqRef, b.request.id);

    return {
      ref: reqRef,
      description: b.request.description,
      unit: b.request.unit,
      quantity: b.request.quantity,
      candidates: b.candidates.map((c, cidx) => {
        const candRef = `${reqRef}E${cidx + 1}`;
        refToOfferItemId.set(candRef, c.extra.offerItemId);
        refSimilarity.set(candRef, c.similarity);
        return {
          ref: candRef,
          description: c.extra.description,
          unit: c.extra.unit ?? 'n/a',
          quantity: c.extra.quantity ?? 0,
          score: c.similarity,
        };
      }),
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
        kind: 'reverse-pass',
        batchIdx,
        items: prompts.map((p) => ({
          ref: p.ref,
          candidates: p.candidates.map((c) => ({ ref: c.ref, score: c.score })),
        })),
      },
    });

    const recoveries: ReverseRecovery[] = [];
    const droppedLowConfidence: Array<{ ref: string; confidence: number; rationale: string }> = [];
    for (const d of result.data.decisions) {
      const requestItemId = refToRequestId.get(d.offerItemRef);
      if (requestItemId === undefined) continue;
      if (d.relation === 'extra' || d.requestItemRef === null) continue;
      const offerItemId = refToOfferItemId.get(d.requestItemRef);
      if (offerItemId === undefined) continue;
      if (d.confidence < env.REVERSE_PASS_MIN_CONFIDENCE) {
        droppedLowConfidence.push({
          ref: d.offerItemRef,
          confidence: d.confidence,
          rationale: d.rationale_short.slice(0, 80),
        });
        continue;
      }
      recoveries.push({
        offerItemId,
        requestItemId,
        relation: d.relation,
        confidence: d.confidence,
        rationale: `${d.rationale_short} (recuperado por reverse pass)`,
        similarity: refSimilarity.get(d.requestItemRef) ?? 0,
      });
    }

    if (droppedLowConfidence.length > 0) {
      logger.info(
        {
          offerId,
          batchIdx,
          dropped: droppedLowConfidence.length,
          minConfidence: env.REVERSE_PASS_MIN_CONFIDENCE,
          examples: droppedLowConfidence.slice(0, 5),
        },
        '[reverse-pass] dropped recoveries por baja confianza',
      );
    }

    logger.info(
      {
        offerId,
        batchIdx,
        decisions: result.data.decisions.length,
        recoveries: recoveries.length,
        costUsd: result.costUsd,
      },
      '[reverse-pass] batch ok',
    );

    return {
      recoveries,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
    };
  } catch (err) {
    logger.error(
      { offerId, batchIdx, err: (err as Error).message },
      '[reverse-pass] batch failed, skipping recoveries',
    );
    return { recoveries: [], promptTokens: 0, completionTokens: 0, costUsd: 0 };
  }
}

function chunk<T>(arr: ReadonlyArray<T>, size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export function applyRecoveries(
  resolved: ResolvableDecision[],
  recoveries: ReadonlyArray<ReverseRecovery>,
): ResolvableDecision[] {
  if (recoveries.length === 0) return resolved;
  const byOfferId = new Map<number, ReverseRecovery>();
  for (const r of recoveries) byOfferId.set(r.offerItemId, r);

  return resolved.map((d) => {
    const rec = byOfferId.get(d.offerItemId);
    if (!rec) return d;
    if (d.relation !== 'extra') return d;
    return {
      offerItemId: rec.offerItemId,
      requestItemId: rec.requestItemId,
      relation: rec.relation,
      confidence: rec.confidence,
      rationale: rec.rationale,
    };
  });
}
