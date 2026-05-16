import 'server-only';
import type { OfferStatus } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';

export async function setOfferStatus(
  offerId: number,
  status: OfferStatus,
  failureReason: string | null = null,
): Promise<void> {
  await prisma.offer.update({
    where: { id: offerId },
    data: { status, failureReason },
  });
}
