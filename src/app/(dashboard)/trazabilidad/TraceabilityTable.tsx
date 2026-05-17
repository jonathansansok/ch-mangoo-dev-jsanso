'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useUrlState } from '@/lib/use-url-state';
import { formatDateTime, formatDuration, formatInt, formatUsdCost } from '@/lib/format';
import { KindBadge } from './KindBadge';
import { TraceabilityDrawer } from './TraceabilityDrawer';
import type { DecisionLogListItem } from '@/core/queries/traceability-list';

interface Props {
  items: readonly DecisionLogListItem[];
  nextCursor: string | null;
  showOfferColumn?: boolean;
}

export function TraceabilityTable({ items, nextCursor, showOfferColumn = true }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const { setParam } = useUrlState();

  return (
    <>
      <div className="overflow-x-auto rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <table className="w-full min-w-[780px]">
          <thead className="bg-[#edebf2]">
            <tr>
              <Th>Hora</Th>
              <Th>Tipo</Th>
              <Th>Modelo</Th>
              {showOfferColumn && <Th>Oferta</Th>}
              <Th align="right">Tokens (in/out)</Th>
              <Th align="right">Costo</Th>
              <Th align="right">Duración</Th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={showOfferColumn ? 7 : 6}
                  className="px-4 py-12 text-center text-sm text-[#6a7282]"
                >
                  No hay llamadas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className="cursor-pointer border-b border-[#edebf2] last:border-b-0 hover:bg-[#f9fafb]"
                >
                  <td className="px-4 py-3 text-xs text-[#65758b]">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <KindBadge kind={r.kind} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#1f2937]">{r.model}</td>
                  {showOfferColumn && (
                    <td className="px-4 py-3 text-xs">
                      {r.offerId !== null ? (
                        <Link
                          href={`/ofertas/${r.offerId}?tab=trazabilidad` as never}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-[#2f458a] hover:underline"
                        >
                          #{r.offerId}
                        </Link>
                      ) : (
                        <span className="text-[#6a7282]">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatInt(r.promptTokens)} / {formatInt(r.completionTokens)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatUsdCost(r.costUsd)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatDuration(r.durationMs)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setParam('cursor', nextCursor)}
            className="rounded-md border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#2f458a] hover:bg-[#f9fafb]"
          >
            Cargar más
          </button>
        </div>
      )}

      <TraceabilityDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-semibold tracking-wide text-[#65758b] uppercase`}
    >
      {children}
    </th>
  );
}
