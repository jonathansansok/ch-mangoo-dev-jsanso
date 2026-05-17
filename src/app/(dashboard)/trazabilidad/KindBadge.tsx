import type { DecisionKind } from '@prisma/client';
import { kindLabel } from '@/core/queries/decision-kind-labels';

const STYLES: Record<DecisionKind, { bg: string; fg: string }> = {
  EXTRACT_HEADER: { bg: '#dbeafe', fg: '#1e40af' },
  EXTRACT_ITEMS: { bg: '#dbeafe', fg: '#1e40af' },
  EMBED_REQUEST: { bg: '#ede9fe', fg: '#5b21b6' },
  EMBED_OFFER: { bg: '#ede9fe', fg: '#5b21b6' },
  JUDGE_BATCH: { bg: '#d1fae5', fg: '#065f46' },
};

export function KindBadge({ kind }: { kind: DecisionKind }) {
  const s = STYLES[kind];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {kindLabel(kind)}
    </span>
  );
}
