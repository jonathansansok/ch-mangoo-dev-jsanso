import 'server-only';
import { prisma } from '@/infra/db/prisma';
import type { ExtractedOffer } from '@/core/extract/schema';

export async function getCachedExtraction(fileHash: string): Promise<{
  payload: ExtractedOffer;
  model: string;
} | null> {
  const row = await prisma.extractionCache.findUnique({ where: { fileHash } });
  if (!row) return null;
  return { payload: row.payload as unknown as ExtractedOffer, model: row.model };
}

export async function saveExtraction(args: {
  fileHash: string;
  fileName: string;
  mime: string;
  model: string;
  payload: ExtractedOffer;
}): Promise<void> {
  await prisma.extractionCache.upsert({
    where: { fileHash: args.fileHash },
    create: {
      fileHash: args.fileHash,
      fileName: args.fileName,
      mime: args.mime,
      model: args.model,
      payload: args.payload as unknown as object,
    },
    update: {
      fileName: args.fileName,
      mime: args.mime,
      model: args.model,
      payload: args.payload as unknown as object,
    },
  });
}
