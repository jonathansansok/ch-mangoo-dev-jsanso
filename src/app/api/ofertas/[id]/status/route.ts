import { NextResponse } from 'next/server';
import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = Number(id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: {
      id: true,
      status: true,
      failureReason: true,
      updatedAt: true,
      extractChunksDone: true,
      extractChunksTotal: true,
      reconciliation: { select: { batchesDone: true, batchesTotal: true } },
    },
  });

  if (!offer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const recon = offer.reconciliation;
  let progress: { done: number; total: number } | null = null;
  if (offer.status === 'EXTRACTING' && offer.extractChunksTotal > 0) {
    progress = { done: offer.extractChunksDone, total: offer.extractChunksTotal };
  } else if (offer.status === 'RECONCILING' && recon && recon.batchesTotal > 0) {
    progress = { done: recon.batchesDone, total: recon.batchesTotal };
  }

  return NextResponse.json({
    id: offer.id,
    status: offer.status,
    failureReason: offer.failureReason,
    updatedAt: offer.updatedAt,
    progress,
  });
}
