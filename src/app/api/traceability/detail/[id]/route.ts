import { NextResponse } from 'next/server';
import { getDecisionLogDetail } from '@/core/queries/traceability-list';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const detail = await getDecisionLogDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    ...detail,
    createdAt: detail.createdAt.toISOString(),
  });
}
