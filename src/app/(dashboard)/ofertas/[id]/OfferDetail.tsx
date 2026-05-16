'use client';

import { useQuery } from '@tanstack/react-query';
import type { Offer, OfferItem, OfferStatus } from '@prisma/client';
import { StatusPill } from '@/components/ui/StatusPill';
import { StatCard } from '@/components/cards/StatCard';
import { formatPrice, formatQty, formatDateLong } from '@/lib/format';

const TERMINAL: ReadonlyArray<OfferStatus> = ['EXTRACTED', 'RECONCILED', 'FAILED'];

interface OfferDetailProps {
  offer: Offer & {
    request: { externalId: string; title: string };
    items: OfferItem[];
  };
}

interface StatusResponse {
  id: number;
  status: OfferStatus;
  failureReason: string | null;
  updatedAt: string;
}

export function OfferDetail({ offer }: OfferDetailProps) {
  const { data: live } = useQuery<StatusResponse>({
    queryKey: ['offer-status', offer.id],
    queryFn: async () => {
      const res = await fetch(`/api/ofertas/${offer.id}/status`, { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo obtener estado');
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && TERMINAL.includes(data.status) ? false : 2000;
    },
    initialData: {
      id: offer.id,
      status: offer.status,
      failureReason: offer.failureReason,
      updatedAt: offer.updatedAt.toISOString(),
    },
  });

  const currentStatus = live?.status ?? offer.status;
  const currentReason = live?.failureReason ?? offer.failureReason;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-[#65758b] uppercase">Estado</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill status={currentStatus} />
            {!TERMINAL.includes(currentStatus) && (
              <span className="text-xs text-[#65758b]">refrescando…</span>
            )}
          </div>
          {currentReason && <p className="mt-2 text-xs text-red-700">Motivo: {currentReason}</p>}
        </div>
        <StatCard label="Proveedor" value={offer.supplierName ?? '—'} />
        <StatCard label="Fecha oferta" value={formatDateLong(offer.offerDate)} />
      </div>

      {offer.observations && (
        <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-[#65758b] uppercase">
            Observaciones
          </p>
          <p className="mt-2 text-sm whitespace-pre-line text-[#1f2937]">{offer.observations}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <div className="flex items-center gap-2 border-b border-[#edebf2] bg-[#edebf2] px-4 py-3">
          <span className="text-base font-semibold text-[#2f458a]">Items ofertados</span>
          <span className="text-xs text-[#65758b]">({offer.items.length})</span>
        </div>
        {offer.items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-[#6a7282]">
            {TERMINAL.includes(currentStatus)
              ? 'No se extrajeron items de esta oferta.'
              : 'Aún no hay items extraídos. Esperando procesamiento…'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-white">
              <tr className="border-b border-[#d1d5db]">
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  Código
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  Descripción
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  Cantidad
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  Unidad
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                  Precio
                </th>
              </tr>
            </thead>
            <tbody>
              {offer.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[#edebf2] last:border-b-0 hover:bg-[#f9fafb]"
                >
                  <td className="px-4 py-3 text-right text-sm text-[#2f458a] tabular-nums">
                    {item.lineNumber}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#1f2937]">
                    {item.supplierCode ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#1f2937]">{item.description}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatQty(item.quantity?.toString() ?? null)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#6a7282]">{item.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatPrice(item.unitPrice?.toString() ?? null, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
