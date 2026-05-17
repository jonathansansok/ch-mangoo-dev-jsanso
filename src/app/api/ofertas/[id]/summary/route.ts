import { prisma } from '@/infra/db/prisma';
import { loadReconciliationViewByOffer } from '@/core/output/load-view';
import { buildMarkdownSummary } from '@/core/output/markdown-builder';
import { buildSummaryFilename } from '@/core/output/filename';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = Number(id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return new Response('Invalid id', { status: 400 });
  }

  const view = await loadReconciliationViewByOffer(offerId);
  if (!view) return new Response('Not found', { status: 404 });

  const rec = await prisma.reconciliation.findUnique({
    where: { id: view.id },
    select: { summary: true, completedAt: true },
  });
  const summary = rec?.summary ?? buildMarkdownSummary(view);

  if (rec && !rec.summary) {
    await prisma.reconciliation.update({
      where: { id: view.id },
      data: { summary },
    });
  }

  const filename = buildSummaryFilename({
    requestExternalId: view.request.externalId,
    supplierName: view.offer.supplierName,
    completedAt: view.completedAt,
  });

  return new Response(summary, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
