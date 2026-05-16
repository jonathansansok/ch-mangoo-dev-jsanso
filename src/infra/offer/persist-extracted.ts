import 'server-only';
import { prisma } from '@/infra/db/prisma';
import type { ExtractedOfferWithMeta } from '@/core/extract/schema';

export async function persistExtractedOffer(
  offerId: number,
  extracted: ExtractedOfferWithMeta,
): Promise<void> {
  const offerDate = parseDate(extracted.header.offerDate);

  await prisma.$transaction([
    prisma.offer.update({
      where: { id: offerId },
      data: {
        supplierName: extracted.header.supplierName,
        offerDate,
        observations: extracted.header.observations,
      },
    }),
    prisma.offerItem.deleteMany({ where: { offerId } }),
    prisma.offerItem.createMany({
      data: extracted.items.map((item) => ({
        offerId,
        lineNumber: item.lineNumber,
        supplierCode: item.supplierCode,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        currency: item.currency,
        unit: item.unit,
        rawObservations: item.rawObservations,
      })),
    }),
  ]);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
