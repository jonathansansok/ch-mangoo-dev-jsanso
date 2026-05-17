import { listAllDecisionLogs } from '@/core/queries/traceability-list';
import { buildTraceabilityCsv } from '@/core/output/traceability-csv';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offerId = Number(id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return new Response('Invalid id', { status: 400 });
  }

  const rows = await listAllDecisionLogs({ offerId });
  const csv = buildTraceabilityCsv(rows);
  const filename = `traceability-${offerId}-${Date.now()}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
