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
    select: { id: true, status: true, failureReason: true, updatedAt: true },
  });

  if (!offer) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(offer);
}
