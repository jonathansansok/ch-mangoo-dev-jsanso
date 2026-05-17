import { listAllDecisionLogs } from '@/core/queries/traceability-list';
import { buildTraceabilityCsv } from '@/core/output/traceability-csv';
import { parseTraceabilityFilters } from '../filters';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filters = parseTraceabilityFilters(url);
  const rows = await listAllDecisionLogs(filters);
  const csv = buildTraceabilityCsv(rows);
  const filename = `traceability-global-${Date.now()}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
