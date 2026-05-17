import Link from 'next/link';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatDateTime, formatInt, formatPercent, formatUsdCost } from '@/lib/format';
import type { ReconciliationListItem } from '@/core/queries/reconciliations-list';

export function ConciliacionesTable({ items }: { items: readonly ReconciliationListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
      <table className="w-full min-w-[960px]">
        <thead className="bg-[#edebf2]">
          <tr>
            <Th>Archivo</Th>
            <Th>Proveedor</Th>
            <Th>Solicitud</Th>
            <Th>Procesada</Th>
            <Th
              align="right"
              hint="Items pedidos cubiertos por la oferta con la cantidad solicitada."
            >
              Match
            </Th>
            <Th
              align="right"
              hint="Items pedidos cubiertos pero con cantidad distinta a la solicitada."
            >
              Parcial
            </Th>
            <Th align="right" hint="Items pedidos que no aparecen en la oferta del proveedor.">
              Faltante
            </Th>
            <Th
              align="right"
              hint="Items ofertados por el proveedor que no fueron pedidos en la solicitud."
            >
              Sobrante
            </Th>
            <Th align="right" hint="(Match + Parcial) / Items pedidos.">
              Cobertura
            </Th>
            <Th align="right" hint="Costo estimado en USD de las llamadas al LLM.">
              Costo LLM
            </Th>
            <Th>Estado</Th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-12 text-center text-sm text-[#6a7282]">
                No hay conciliaciones que coincidan. Subí ofertas en{' '}
                <Link href="/ofertas/upload" className="font-semibold text-[#2f458a] underline">
                  /ofertas/upload
                </Link>
                .
              </td>
            </tr>
          ) : (
            items.map((it) => (
              <tr
                key={it.reconciliationId}
                className="border-b border-[#edebf2] last:border-b-0 hover:bg-[#f9fafb]"
              >
                <td className="px-4 py-3 text-sm">
                  <Link
                    href={`/ofertas/${it.offerId}?tab=conciliacion` as never}
                    className="font-semibold text-[#2f458a] hover:underline"
                  >
                    {it.sourceFile}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-[#1f2937]">{it.supplierName ?? '—'}</td>
                <td className="px-4 py-3 text-xs">
                  <Link
                    href={`/solicitudes/${it.requestId}` as never}
                    className="font-mono font-semibold text-[#2f458a] hover:underline"
                  >
                    {it.requestExternalId}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-[#65758b]">
                  {formatDateTime(it.completedAt ?? it.createdAt)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-emerald-700 tabular-nums">
                  {formatInt(it.itemsMatched)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-amber-700 tabular-nums">
                  {formatInt(it.itemsPartial)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-red-700 tabular-nums">
                  {formatInt(it.itemsMissing)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-blue-700 tabular-nums">
                  {formatInt(it.itemsExtra)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-[#2f458a] tabular-nums">
                  {formatPercent(it.coveragePct)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                  {formatUsdCost(it.totalCostUsd)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={it.offerStatus} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  hint,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  hint?: string;
}) {
  return (
    <th
      title={hint}
      className={`px-4 py-3 text-${align} text-xs font-semibold tracking-wide text-[#65758b] uppercase ${hint ? 'cursor-help' : ''}`}
    >
      {children}
    </th>
  );
}
