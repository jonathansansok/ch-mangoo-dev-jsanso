import type { DecisionLogListItem } from '@/core/queries/traceability-list';

const HEADER = [
  'id',
  'created_at',
  'kind',
  'model',
  'offer_id',
  'reconciliation_line_id',
  'prompt_tokens',
  'completion_tokens',
  'cost_usd',
  'duration_ms',
] as const;

function escape(cell: string | number | null): string {
  if (cell === null) return '';
  const s = typeof cell === 'number' ? cell.toString() : cell;
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildTraceabilityCsv(rows: readonly DecisionLogListItem[]): string {
  const lines: string[] = [HEADER.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt.toISOString(),
        r.kind,
        r.model,
        r.offerId,
        r.reconciliationLineId,
        r.promptTokens,
        r.completionTokens,
        r.costUsd.toFixed(6),
        r.durationMs,
      ]
        .map(escape)
        .join(';'),
    );
  }
  return lines.join('\r\n');
}
