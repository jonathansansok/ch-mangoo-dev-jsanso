import { describe, expect, it } from 'vitest';
import { buildSummaryFilename } from './filename';

describe('buildSummaryFilename', () => {
  it('uses supplier name slugified', () => {
    expect(
      buildSummaryFilename({
        requestExternalId: 'REQ-OFI-2026-001',
        supplierName: 'Suministros Industriales & Co.',
        completedAt: new Date('2026-05-15T10:00:00Z'),
      }),
    ).toBe('oferta-REQ-OFI-2026-001-suministros-industriales-co-2026-05-15.md');
  });

  it('uses sin-proveedor for null supplier', () => {
    expect(
      buildSummaryFilename({
        requestExternalId: 'REQ-X',
        supplierName: null,
        completedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toBe('oferta-REQ-X-sin-proveedor-2026-01-01.md');
  });
});
