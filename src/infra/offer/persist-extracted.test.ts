import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/infra/db/prisma', () => ({
  prisma: {
    offer: { update: vi.fn() },
    offerItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import { prisma } from '@/infra/db/prisma';
import type { ExtractedOfferWithMeta } from '@/core/extract/schema';
import { persistExtractedOffer } from './persist-extracted';

const offerUpdate = vi.mocked(prisma.offer.update);
const itemDelete = vi.mocked(prisma.offerItem.deleteMany);
const itemCreate = vi.mocked(prisma.offerItem.createMany);

function makeExtracted(): ExtractedOfferWithMeta {
  return {
    header: { supplierName: 'ACME', offerDate: '2026-01-15', observations: 'obs' },
    items: [
      {
        lineNumber: 1,
        supplierCode: 'SIP-1',
        description: 'Boligrafo',
        quantity: 10,
        unitPrice: 250,
        currency: 'ARS',
        unit: 'unidad',
        rawObservations: null,
      },
    ],
    meta: { strategy: 'text' as const, model: 'gpt-4o-mini', fromCache: false },
  };
}

describe('persistExtractedOffer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('actualiza header y reemplaza items', async () => {
    offerUpdate.mockResolvedValue({} as never);
    itemDelete.mockResolvedValue({ count: 0 } as never);
    itemCreate.mockResolvedValue({ count: 1 } as never);

    await persistExtractedOffer(42, makeExtracted());

    expect(offerUpdate).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        supplierName: 'ACME',
        offerDate: new Date('2026-01-15'),
        observations: 'obs',
      },
    });
    expect(itemDelete).toHaveBeenCalledWith({ where: { offerId: 42 } });
    const items = itemCreate.mock.calls[0]![0]!.data as Array<{
      offerId: number;
      lineNumber: number;
      description: string;
      currency: string | null;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      offerId: 42,
      lineNumber: 1,
      description: 'Boligrafo',
      currency: 'ARS',
    });
  });

  it('offerDate null cuando header.offerDate es null', async () => {
    offerUpdate.mockResolvedValue({} as never);
    itemDelete.mockResolvedValue({ count: 0 } as never);
    itemCreate.mockResolvedValue({ count: 0 } as never);
    const extracted = makeExtracted();
    extracted.header.offerDate = null;
    await persistExtractedOffer(1, extracted);
    expect(offerUpdate.mock.calls[0]![0]!.data.offerDate).toBeNull();
  });

  it('offerDate null cuando string no parseable', async () => {
    offerUpdate.mockResolvedValue({} as never);
    itemDelete.mockResolvedValue({ count: 0 } as never);
    itemCreate.mockResolvedValue({ count: 0 } as never);
    const extracted = makeExtracted();
    extracted.header.offerDate = 'no-es-fecha';
    await persistExtractedOffer(1, extracted);
    expect(offerUpdate.mock.calls[0]![0]!.data.offerDate).toBeNull();
  });
});
