'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/infra/db/prisma';
import { sha256 } from '@/lib/hash';
import { logger } from '@/lib/logger';
import { processOfferPipeline } from '@/infra/offer/pipeline';
import { UploadOfferSchema } from './schema';

export interface UploadOfferResult {
  offerId: number;
}

export async function uploadOffer(formData: FormData): Promise<UploadOfferResult> {
  logger.info('[action] uploadOffer called');

  const parsed = UploadOfferSchema.parse({
    requestId: formData.get('requestId'),
    file: formData.get('file'),
  });

  logger.info(
    {
      requestId: parsed.requestId,
      fileName: parsed.file.name,
      mime: parsed.file.type,
      sizeKb: (parsed.file.size / 1024).toFixed(1),
    },
    '[action] payload valid',
  );

  const buffer = Buffer.from(await parsed.file.arrayBuffer());
  const hash = sha256(buffer);
  logger.info({ fileHash: hash.slice(0, 12) }, '[action] file hashed');

  const existing = await prisma.offer.findUnique({ where: { sourceFileHash: hash } });
  if (existing) {
    logger.info(
      { existingOfferId: existing.id, status: existing.status },
      '[action] hash match, reusing offer',
    );
    revalidatePath('/ofertas');
    return { offerId: existing.id };
  }

  const offer = await prisma.offer.create({
    data: {
      requestId: parsed.requestId,
      sourceFile: parsed.file.name,
      sourceFileHash: hash,
      sourceFileMime: parsed.file.type,
      status: 'PENDING',
    },
  });
  logger.info({ offerId: offer.id }, '[action] offer created PENDING');

  void processOfferPipeline({
    offerId: offer.id,
    buffer,
    fileName: parsed.file.name,
    mime: parsed.file.type,
  });
  logger.info({ offerId: offer.id }, '[action] pipeline dispatched in background');

  revalidatePath('/ofertas');
  return { offerId: offer.id };
}
