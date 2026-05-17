import { History } from 'lucide-react';
import {
  listDecisionLogs,
  listDistinctModels,
  listOffersWithLogs,
} from '@/core/queries/traceability-list';
import { aggregateDecisionLogs } from '@/core/queries/traceability-aggregate';
import { TraceabilityKpis } from './TraceabilityKpis';
import { TraceabilityFilters } from './TraceabilityFilters';
import { TraceabilityTable } from './TraceabilityTable';
import { TraceabilityExportButtons } from './TraceabilityExportButtons';
import { parseFilters } from './filter-params';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TrazabilidadPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [page, stats, models, offers] = await Promise.all([
    listDecisionLogs({ ...filters, take: 100 }),
    aggregateDecisionLogs(filters),
    listDistinctModels(),
    listOffersWithLogs(),
  ]);

  const offerOptions = offers.map((o) => ({
    id: o.id,
    label: `#${o.id} · ${o.supplierName ?? 'sin proveedor'} — ${o.sourceFile}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex items-start gap-2.5">
          <History className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
          <div>
            <h1 className="text-2xl leading-tight font-bold text-[#2f458a] md:text-[28px]">
              Trazabilidad
            </h1>
            <p className="text-sm text-[#65758b]">
              Auditoría de todas las llamadas al modelo. Click en una fila para ver el prompt y la
              respuesta.
            </p>
          </div>
        </div>
        <TraceabilityExportButtons basePath="/api/traceability" />
      </div>

      <TraceabilityKpis stats={stats} />
      <TraceabilityFilters models={models} offers={offerOptions} />
      <TraceabilityTable items={page.items} nextCursor={page.nextCursor} />
    </div>
  );
}
