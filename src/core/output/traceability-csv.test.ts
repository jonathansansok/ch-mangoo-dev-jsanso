import { describe, expect, it } from 'vitest';
import { buildTraceabilityCsv } from './traceability-csv';
import type { DecisionLogListItem } from '@/core/queries/traceability-list';

function row(overrides: Partial<DecisionLogListItem> = {}): DecisionLogListItem {
  return {
    id: '1',
    offerId: 10,
    reconciliationLineId: null,
    kind: 'JUDGE_BATCH',
    model: 'gpt-4o-mini',
    promptTokens: 1200,
    completionTokens: 400,
    costUsd: 0.00042,
    durationMs: 1340,
    createdAt: new Date('2026-05-15T17:00:00Z'),
    ...overrides,
  };
}

describe('buildTraceabilityCsv', () => {
  it('emits header on first line', () => {
    const csv = buildTraceabilityCsv([]);
    expect(csv).toBe(
      'id;created_at;kind;model;offer_id;reconciliation_line_id;prompt_tokens;completion_tokens;cost_usd;duration_ms',
    );
  });

  it('renders row with semicolon separator', () => {
    const csv = buildTraceabilityCsv([row()]);
    const line = csv.split('\r\n')[1]!;
    expect(line.split(';')).toEqual([
      '1',
      '2026-05-15T17:00:00.000Z',
      'JUDGE_BATCH',
      'gpt-4o-mini',
      '10',
      '',
      '1200',
      '400',
      '0.000420',
      '1340',
    ]);
  });

  it('escapes semicolons in model name with quotes', () => {
    const csv = buildTraceabilityCsv([row({ model: 'gpt-4o;weird' })]);
    expect(csv).toContain('"gpt-4o;weird"');
  });

  it('joins lines with CRLF', () => {
    const csv = buildTraceabilityCsv([row(), row({ id: '2' })]);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
