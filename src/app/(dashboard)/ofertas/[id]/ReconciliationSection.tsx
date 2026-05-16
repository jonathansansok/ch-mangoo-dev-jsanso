'use client';

import { StatCard } from '@/components/cards/StatCard';
import { RelationPill } from '@/components/ui/RelationPill';
import { formatQty, formatPercent, formatUsdCost } from '@/lib/format';
import type { ReconciliationView } from './types';

export function ReconciliationSection({ reconciliation }: { reconciliation: ReconciliationView }) {
  const confidenceFmt = (s: string) => formatPercent(Number(s) * 100);
  const total =
    reconciliation.itemsCovered + reconciliation.itemsMissing + reconciliation.itemsExtra;
  const coverage = total > 0 ? formatPercent((reconciliation.itemsCovered / total) * 100) : '—';

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cubiertos" value={String(reconciliation.itemsCovered)} />
        <StatCard label="Parciales" value={String(reconciliation.itemsPartial)} />
        <StatCard label="Faltantes" value={String(reconciliation.itemsMissing)} />
        <StatCard label="Sobrantes" value={String(reconciliation.itemsExtra)} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Cobertura" value={coverage} />
        <StatCard label="Baja confianza" value={String(reconciliation.itemsLowConfidence)} />
        <StatCard label="Costo total" value={formatUsdCost(reconciliation.totalCostUsd)} />
      </div>

      <div className="overflow-hidden rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <div className="flex items-center gap-2 border-b border-[#edebf2] bg-[#edebf2] px-4 py-3">
          <span className="text-base font-semibold text-[#2f458a]">Conciliación</span>
          <span className="text-xs text-[#65758b]">({reconciliation.lines.length} líneas)</span>
        </div>
        <table className="w-full">
          <thead className="bg-white">
            <tr className="border-b border-[#d1d5db]">
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Relación
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Pedido
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Ofrecido
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Qty pedida
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Qty ofertada
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Confianza
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Rationale
              </th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.lines.map((line) => (
              <tr
                key={line.id}
                className="border-b border-[#edebf2] last:border-b-0 hover:bg-[#f9fafb]"
              >
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <RelationPill relation={line.relation} />
                    {line.flags.length > 0 && (
                      <span className="text-[10px] text-amber-700">{line.flags.join(', ')}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#1f2937]">
                  {line.requestItem ? (
                    <>
                      <span className="font-mono text-xs text-[#65758b]">
                        #{line.requestItem.externalItemId}
                      </span>{' '}
                      {line.requestItem.description}
                    </>
                  ) : (
                    <span className="text-[#6a7282]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-[#1f2937]">
                  {line.offerItem ? (
                    <>
                      <span className="font-mono text-xs text-[#65758b]">
                        #{line.offerItem.lineNumber}
                      </span>{' '}
                      {line.offerItem.description}
                    </>
                  ) : (
                    <span className="text-[#6a7282]">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                  {formatQty(line.quantityRequested)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                  {formatQty(line.quantityOffered)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                  {confidenceFmt(line.confidence)}
                </td>
                <td className="px-4 py-3 text-xs text-[#6a7282]">{line.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
