import {
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatPrice,
  formatQty,
  formatUsdCost,
} from '@/lib/format';
import type { ReconciliationView, ReconciliationViewLine } from './types';

const TRUNCATE_AT = 80;

function truncate(s: string | null | undefined, max = TRUNCATE_AT): string {
  if (!s) return '—';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

function escapeCell(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function relationLabel(relation: ReconciliationViewLine['relation']): string {
  switch (relation) {
    case 'MATCH':
      return 'Coincide';
    case 'PARTIAL_QUANTITY':
      return 'Cant. parcial';
    case 'MISSING_FROM_OFFER':
      return 'Faltante';
    case 'EXTRA':
      return 'Sobrante';
  }
}

function relationWithFlag(line: ReconciliationViewLine): string {
  const base = relationLabel(line.relation);
  return line.lowConfidence ? `${base} · Baja confianza` : base;
}

function flagSuffix(flags: string[]): string {
  if (!flags.length) return '';
  const labels: Record<string, string> = {
    quantity_anomaly: 'cantidad fuera de rango',
    unit_mismatch: 'unidades distintas',
    excess: 'excedente',
    below_similarity_threshold: 'similitud baja',
    currency_unknown: 'moneda no declarada',
  };
  const parts = flags.map((f) => labels[f] ?? f);
  return ` (${parts.join(', ')})`;
}

function headerSection(view: ReconciliationView): string {
  const supplier = view.offer.supplierName ?? '(no identificado)';
  return [
    `# Conciliación de oferta — ${escapeCell(supplier)}`,
    '',
    '## Resumen',
    `- **Solicitud:** ${view.request.externalId} — ${escapeCell(view.request.title)}`,
    `- **Proveedor:** ${escapeCell(supplier)}`,
    `- **Archivo origen:** \`${view.offer.sourceFile}\``,
    `- **Fecha de la oferta:** ${formatDateLong(view.offer.offerDate)}`,
    `- **Procesado:** ${formatDateTime(view.createdAt)}`,
    `- **Estado:** Conciliada`,
  ].join('\n');
}

function indicatorsSection(view: ReconciliationView): string {
  const total = view.request.totalItems;
  const covered = view.itemsCovered + view.itemsPartial;
  const pct = total > 0 ? (covered / total) * 100 : 0;
  return [
    '## Indicadores',
    '',
    '| Métrica | Valor |',
    '|---|---:|',
    `| Items pedidos | ${total} |`,
    `| Cobertura (match + parciales) | ${covered} (${formatPercent(pct)}) |`,
    `| Items match | ${view.itemsCovered} |`,
    `| Items con cantidad parcial | ${view.itemsPartial} |`,
    `| Items faltantes | ${view.itemsMissing} |`,
    `| Items sobrantes en la oferta | ${view.itemsExtra} |`,
    `| Items con baja confianza | ${view.itemsLowConfidence} |`,
  ].join('\n');
}

function observationsSection(view: ReconciliationView): string | null {
  if (!view.offer.observations) return null;
  return ['## Observaciones del proveedor', '', view.offer.observations].join('\n');
}

function matchedRow(line: ReconciliationViewLine): string {
  const offer = line.offerItem;
  const req = line.requestItem;
  return [
    '|',
    offer?.lineNumber ?? '—',
    '|',
    escapeCell(truncate(req?.description)),
    '|',
    escapeCell(truncate(offer?.description)),
    '|',
    formatQty(line.quantityRequested),
    '|',
    formatQty(line.quantityOffered),
    '|',
    escapeCell(offer?.unit ?? null),
    '|',
    formatPrice(offer?.unitPrice ?? null, offer?.currency ?? null),
    '|',
    relationWithFlag(line),
    '|',
    `${escapeCell(line.rationale)}${flagSuffix(line.flags)}`,
    '|',
  ].join(' ');
}

function matchedSection(view: ReconciliationView): string {
  const lines = view.lines.filter(
    (l) => l.relation === 'MATCH' || l.relation === 'PARTIAL_QUANTITY',
  );
  if (lines.length === 0) {
    return ['## Items conciliados', '', '_Sin items conciliados en esta oferta._'].join('\n');
  }
  const sorted = [...lines].sort(
    (a, b) => (a.offerItem?.lineNumber ?? 0) - (b.offerItem?.lineNumber ?? 0),
  );
  return [
    '## Items conciliados',
    '',
    '| # | Pedido | Ofertado | Cant. pedida | Cant. ofertada | Unidad | Precio unit. | Relación | Justificación |',
    '|---:|---|---|---:|---:|---|---:|---|---|',
    ...sorted.map(matchedRow),
  ].join('\n');
}

function missingRow(line: ReconciliationViewLine): string {
  const req = line.requestItem;
  return `| ${req?.externalItemId ?? '—'} | ${escapeCell(truncate(req?.description))} | ${formatQty(req?.quantity ?? null)} | ${escapeCell(req?.unit ?? null)} |`;
}

function missingSection(view: ReconciliationView): string {
  const lines = view.lines.filter((l) => l.relation === 'MISSING_FROM_OFFER');
  if (lines.length === 0) {
    return [
      '## Items faltantes',
      '',
      '_Todos los items pedidos están cubiertos por esta oferta._',
    ].join('\n');
  }
  const sorted = [...lines].sort(
    (a, b) => (a.requestItem?.externalItemId ?? 0) - (b.requestItem?.externalItemId ?? 0),
  );
  return [
    '## Items faltantes',
    '',
    '| # | Descripción | Cantidad | Unidad |',
    '|---:|---|---:|---|',
    ...sorted.map(missingRow),
  ].join('\n');
}

function extraRow(line: ReconciliationViewLine): string {
  const offer = line.offerItem;
  return [
    '|',
    offer?.lineNumber ?? '—',
    '|',
    escapeCell(truncate(offer?.description)),
    '|',
    formatQty(offer?.quantity ?? null),
    '|',
    escapeCell(offer?.unit ?? null),
    '|',
    formatPrice(offer?.unitPrice ?? null, offer?.currency ?? null),
    '|',
    escapeCell(line.rationale),
    '|',
  ].join(' ');
}

function extraSection(view: ReconciliationView): string {
  const lines = view.lines.filter((l) => l.relation === 'EXTRA');
  if (lines.length === 0) {
    return ['## Items sobrantes en la oferta', '', '_La oferta no incluye items sobrantes._'].join(
      '\n',
    );
  }
  const sorted = [...lines].sort(
    (a, b) => (a.offerItem?.lineNumber ?? 0) - (b.offerItem?.lineNumber ?? 0),
  );
  return [
    '## Items sobrantes en la oferta',
    '',
    '| # | Descripción | Cantidad | Unidad | Precio unit. | Justificación |',
    '|---:|---|---:|---|---:|---|',
    ...sorted.map(extraRow),
  ].join('\n');
}

function traceabilitySection(view: ReconciliationView): string {
  return [
    '## Trazabilidad',
    '',
    `- **Modelo de extracción:** ${view.models.extractModel ?? '—'}`,
    `- **Modelo de conciliación:** ${view.models.judgeModel ?? '—'}`,
    `- **Modelo de embeddings:** ${view.models.embedModel ?? '—'}`,
    `- **Llamadas al LLM:** ${view.decisionLogCount}`,
    `- **Tokens (prompt / completion):** ${view.totalPromptTokens.toLocaleString('es-AR')} / ${view.totalCompletionTokens.toLocaleString('es-AR')}`,
    `- **Costo estimado:** ${formatUsdCost(view.totalCostUsd)}`,
    `- **Duración total:** ${formatDuration(view.durationMs)}`,
  ].join('\n');
}

function footer(view: ReconciliationView): string {
  return [
    '---',
    '',
    `_Generado automáticamente el ${formatDateTime(view.completedAt ?? view.createdAt)}. Verificar contra la oferta original antes de adjudicar._`,
  ].join('\n');
}

export function buildMarkdownSummary(view: ReconciliationView): string {
  const sections: (string | null)[] = [
    headerSection(view),
    indicatorsSection(view),
    observationsSection(view),
    matchedSection(view),
    missingSection(view),
    extraSection(view),
    traceabilitySection(view),
    footer(view),
  ];
  return sections.filter((s): s is string => s !== null).join('\n\n');
}
