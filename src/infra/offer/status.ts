import 'server-only';
import type { OfferStatus } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { logger } from '@/lib/logger';

export async function setOfferStatus(
  offerId: number,
  status: OfferStatus,
  failureReason: string | null = null,
): Promise<void> {
  logger.info({ offerId, status, failureReason }, '[offer] setStatus');
  await prisma.offer.update({
    where: { id: offerId },
    data: { status, failureReason },
  });
}
