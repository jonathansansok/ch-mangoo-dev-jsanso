import { TraceabilityKpis } from '@/app/(dashboard)/trazabilidad/TraceabilityKpis';
import { TraceabilityTable } from '@/app/(dashboard)/trazabilidad/TraceabilityTable';
import { TraceabilityExportButtons } from '@/app/(dashboard)/trazabilidad/TraceabilityExportButtons';
import { aggregateDecisionLogs } from '@/core/queries/traceability-aggregate';
import { listDecisionLogs } from '@/core/queries/traceability-list';

interface Props {
  offerId: number;
}

export async function TrazabilidadTab({ offerId }: Props) {
  const [page, stats] = await Promise.all([
    listDecisionLogs({ offerId, take: 200 }),
    aggregateDecisionLogs({ offerId }),
  ]);

  if (stats.totalCalls === 0) {
    return (
      <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-6">
        <p className="text-sm text-[#6a7282]">
          Esta oferta aún no tiene llamadas registradas. Si fue procesada desde caché, las llamadas
          originales están asociadas a la oferta de origen.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <TraceabilityExportButtons basePath={`/api/ofertas/${offerId}/traceability`} />
      </div>
      <TraceabilityKpis stats={stats} />
      <TraceabilityTable items={page.items} nextCursor={page.nextCursor} showOfferColumn={false} />
    </div>
  );
}
