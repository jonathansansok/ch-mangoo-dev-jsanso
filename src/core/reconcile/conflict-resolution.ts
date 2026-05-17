export interface ResolvableDecision {
  offerItemId: number;
  requestItemId: number | null;
  relation: 'match' | 'partial_quantity' | 'extra';
  confidence: number;
  lowConfidence: boolean;
  rationale: string;
}

export function resolveConflicts(decisions: ResolvableDecision[]): ResolvableDecision[] {
  const winners = new Map<number, ResolvableDecision>();

  for (const d of decisions) {
    if (d.requestItemId === null || d.relation === 'extra' || d.lowConfidence) {
      continue;
    }
    const current = winners.get(d.requestItemId);
    if (!current || d.confidence > current.confidence) {
      winners.set(d.requestItemId, d);
    }
  }

  return decisions.map((d) => {
    if (d.requestItemId === null) return d;
    if (d.relation === 'extra' || d.lowConfidence) return d;
    const winner = winners.get(d.requestItemId);
    if (winner && winner.offerItemId === d.offerItemId) return d;
    return {
      ...d,
      relation: 'extra' as const,
      requestItemId: null,
      rationale: 'Otro item de la oferta matcheó mejor este pedido',
    };
  });
}
