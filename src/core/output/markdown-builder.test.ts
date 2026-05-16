import { describe, expect, it } from 'vitest';
import { buildMarkdownSummary } from './markdown-builder';
import type { ReconciliationView, ReconciliationViewLine } from './types';

function makeView(overrides: Partial<ReconciliationView> = {}): ReconciliationView {
  const base: ReconciliationView = {
    id: 1,
    offerId: 10,
    itemsCovered: 5,
    itemsMissing: 1,
    itemsExtra: 1,
    itemsPartial: 1,
    itemsLowConfidence: 0,
    totalPromptTokens: 2000,
    totalCompletionTokens: 800,
    totalCostUsd: 0.022,
    decisionLogCount: 4,
    createdAt: new Date('2026-05-15T17:00:00Z'),
    completedAt: new Date('2026-05-15T17:00:30Z'),
    offer: {
      id: 10,
      supplierName: 'Suministros Industriales',
      offerDate: new Date('2026-05-10T00:00:00Z'),
      sourceFile: 'oferta.pdf',
      observations: null,
      createdAt: new Date('2026-05-15T17:00:00Z'),
    },
    request: { externalId: 'REQ-OFI-2026-001', title: 'Compra de insumos', totalItems: 6 },
    models: {
      extractModel: 'gpt-4o-mini',
      judgeModel: 'gpt-4o-mini',
      embedModel: 'text-embedding-3-small',
    },
    durationMs: 5230,
    lines: [],
  };
  return { ...base, ...overrides };
}

function makeLine(overrides: Partial<ReconciliationViewLine>): ReconciliationViewLine {
  const base: ReconciliationViewLine = {
    id: 1,
    relation: 'MATCH',
    confidence: 0.95,
    embeddingSimilarity: 0.85,
    quantityRequested: 100,
    quantityOffered: 100,
    rationale: 'misma necesidad con vocabulario distinto',
    flags: [],
    offerItem: {
      id: 1,
      lineNumber: 1,
      description: 'Papel A4 75g',
      quantity: 100,
      unit: 'unidad',
      unitPrice: 50,
      currency: 'ARS',
      supplierCode: 'OFN-001',
    },
    requestItem: {
      id: 1,
      externalItemId: 1,
      description: 'Resma papel A4 75g',
      quantity: 100,
      unit: 'unidad',
    },
  };
  return { ...base, ...overrides };
}

describe('buildMarkdownSummary', () => {
  it('renders header with supplier', () => {
    const md = buildMarkdownSummary(makeView());
    expect(md).toContain('# Conciliación de oferta — Suministros Industriales');
    expect(md).toContain('REQ-OFI-2026-001');
  });

  it('renders supplier (no identificado) when null', () => {
    const view = makeView();
    view.offer.supplierName = null;
    const md = buildMarkdownSummary(view);
    expect(md).toContain('(no identificado)');
  });

  it('shows missing section paragraph when none', () => {
    const view = makeView();
    view.itemsMissing = 0;
    const md = buildMarkdownSummary(view);
    expect(md).toContain('Todos los items pedidos están cubiertos por esta oferta.');
  });

  it('shows extra section paragraph when none', () => {
    const view = makeView();
    view.itemsExtra = 0;
    const md = buildMarkdownSummary(view);
    expect(md).toContain('La oferta no incluye items sobrantes.');
  });

  it('includes observations when present', () => {
    const view = makeView();
    view.offer.observations = 'Plazo de entrega 7 días.';
    const md = buildMarkdownSummary(view);
    expect(md).toContain('## Observaciones del proveedor');
    expect(md).toContain('Plazo de entrega 7 días.');
  });

  it('omits observations section when absent', () => {
    const md = buildMarkdownSummary(makeView());
    expect(md).not.toContain('## Observaciones del proveedor');
  });

  it('renders match line with formatted qty and price', () => {
    const view = makeView();
    view.lines = [makeLine({})];
    const md = buildMarkdownSummary(view);
    expect(md).toContain('Papel A4 75g');
    expect(md).toContain('ARS 50,00');
    expect(md).toContain('Coincide');
  });

  it('escapes pipes in descriptions', () => {
    const view = makeView();
    view.lines = [
      makeLine({
        offerItem: {
          id: 1,
          lineNumber: 1,
          description: 'Cable | unipolar',
          quantity: 100,
          unit: 'metro',
          unitPrice: 10,
          currency: 'ARS',
          supplierCode: null,
        },
      }),
    ];
    const md = buildMarkdownSummary(view);
    expect(md).toContain('Cable \\| unipolar');
  });

  it('renders trazability with es-AR cost format', () => {
    const md = buildMarkdownSummary(makeView());
    expect(md).toContain('US$ 0,0220');
    expect(md).toContain('gpt-4o-mini');
  });

  it('renders missing line', () => {
    const view = makeView();
    view.lines = [
      makeLine({
        relation: 'MISSING_FROM_OFFER',
        offerItem: null,
        rationale: 'No incluido',
      }),
    ];
    const md = buildMarkdownSummary(view);
    expect(md).toContain('| 1 | Resma papel A4 75g | 100 | unidad |');
  });

  it('renders extra line', () => {
    const view = makeView();
    view.lines = [
      makeLine({
        relation: 'EXTRA',
        requestItem: null,
        rationale: 'producto adicional sugerido',
      }),
    ];
    const md = buildMarkdownSummary(view);
    expect(md).toContain('producto adicional sugerido');
  });

  it('appends flag suffix on rationale', () => {
    const view = makeView();
    view.lines = [
      makeLine({
        relation: 'PARTIAL_QUANTITY',
        flags: ['quantity_anomaly', 'unit_mismatch'],
        rationale: 'cantidad menor a la solicitada',
      }),
    ];
    const md = buildMarkdownSummary(view);
    expect(md).toContain('cantidad fuera de rango');
    expect(md).toContain('unidades distintas');
  });
});
