'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/infra/db/prisma';
import { sha256 } from '@/lib/hash';
import { processOfferPipeline } from '@/infra/offer/pipeline';
import { UploadOfferSchema } from './schema';

export interface UploadOfferResult {
  offerId: number;
}

export async function uploadOffer(formData: FormData): Promise<UploadOfferResult> {
  const parsed = UploadOfferSchema.parse({
    requestId: formData.get('requestId'),
    file: formData.get('file'),
  });

  const buffer = Buffer.from(await parsed.file.arrayBuffer());
  const hash = sha256(buffer);

  const existing = await prisma.offer.findUnique({ where: { sourceFileHash: hash } });
  if (existing) {
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

  void processOfferPipeline({
    offerId: offer.id,
    buffer,
    fileName: parsed.file.name,
    mime: parsed.file.type,
  });

  revalidatePath('/ofertas');
  return { offerId: offer.id };
}
