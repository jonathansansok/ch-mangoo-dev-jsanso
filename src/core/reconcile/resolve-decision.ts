import type { JudgeDecision } from './judge-schema';
import type { Candidate } from './shortlist';
import type { ResolvableDecision } from './conflict-resolution';
import { runVerifiers, type VerifierConfig } from './verifiers';

export interface ResolveRequestItem {
  quantity: number;
  unit: string;
}

export interface ResolveContext {
  refToOfferId: Map<string, number>;
  refToRequestId: Map<string, number>;
  shortlists: Map<number, Candidate[]>;
  requestById: Map<number, ResolveRequestItem>;
  verifierConfig: VerifierConfig;
  trustJudgeConfidence: number;
}

export function resolveDecision(
  decision: JudgeDecision,
  ctx: ResolveContext,
): ResolvableDecision | null {
  const offerItemId = ctx.refToOfferId.get(decision.offerItemRef);
  if (offerItemId === undefined) return null;

  let requestItemId: number | null = null;
  if (decision.requestItemRef !== null) {
    requestItemId = ctx.refToRequestId.get(decision.requestItemRef) ?? null;
  }

  const isMatching = decision.relation === 'match' || decision.relation === 'partial_quantity';

  if (isMatching && decision.requestItemRef !== null && requestItemId === null) {
    return {
      offerItemId,
      requestItemId: null,
      relation: 'extra',
      confidence: decision.confidence,
      lowConfidence: true,
      rationale: 'Judge devolvió referencia de pedido inválida',
    };
  }

  let lowConfidence = false;

  if (isMatching && requestItemId !== null) {
    const candidate = ctx.shortlists.get(offerItemId)?.find((c) => c.id === requestItemId);
    const requestItem = ctx.requestById.get(requestItemId);
    const verifier = runVerifiers(
      {
        similarity: candidate?.similarity ?? null,
        quantityOffered: null,
        quantityRequested: requestItem?.quantity ?? null,
        unitOffered: null,
        unitRequested: requestItem?.unit ?? null,
      },
      ctx.verifierConfig,
    );
    const trustsJudge = decision.confidence >= ctx.trustJudgeConfidence;
    if (verifier.shouldDowngradeToLowConfidence && !trustsJudge) {
      lowConfidence = true;
    }
  }

  return {
    offerItemId,
    requestItemId,
    relation: decision.relation,
    confidence: decision.confidence,
    lowConfidence,
    rationale: decision.rationale_short,
  };
}
