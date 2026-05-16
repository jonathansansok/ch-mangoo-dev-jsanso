import type { LineRelation } from '@prisma/client';

const STYLES: Record<LineRelation, { bg: string; fg: string; label: string }> = {
  MATCH: { bg: '#d1fae5', fg: '#065f46', label: 'Match' },
  PARTIAL_QUANTITY: { bg: '#fef3c7', fg: '#92400e', label: 'Parcial' },
  MISSING_FROM_OFFER: { bg: '#fee2e2', fg: '#991b1b', label: 'Faltante' },
  EXTRA: { bg: '#dbeafe', fg: '#1e40af', label: 'Extra' },
  LOW_CONFIDENCE: { bg: '#f3f4f6', fg: '#4b5563', label: 'Baja confianza' },
};

export function RelationPill({ relation }: { relation: LineRelation }) {
  const s = STYLES[relation];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
