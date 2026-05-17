'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { OfferStatus } from '@prisma/client';
import { StatusPill } from '@/components/ui/StatusPill';
import { CircularProgress } from '@/components/ui/CircularProgress';
import { StatCard } from '@/components/cards/StatCard';
import { formatDateLong } from '@/lib/format';
import type { OfferView } from './types';

const TERMINAL: ReadonlyArray<OfferStatus> = ['EXTRACTED', 'RECONCILED', 'FAILED'];

interface StatusResponse {
  id: number;
  status: OfferStatus;
  failureReason: string | null;
  updatedAt: string;
  progress: { done: number; total: number } | null;
}

interface Props {
  offer: OfferView;
  children: ReactNode;
}

export function OfferDetail({ offer, children }: Props) {
  const router = useRouter();
  const lastStatusRef = useRef<OfferStatus>(offer.status);
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
      progress: null,
    },
  });

  const currentStatus = live?.status ?? offer.status;
  const currentReason = live?.failureReason ?? offer.failureReason;
  const progress = live?.progress ?? null;
  const inProgress = !TERMINAL.includes(currentStatus);
  const reconcileDone = progress?.done ?? 0;
  const reconcileTotal = progress?.total ?? 0;
  const progressLabel =
    currentStatus === 'EXTRACTING'
      ? 'Extrayendo'
      : currentStatus === 'RECONCILING'
        ? reconcileTotal > 0 && reconcileDone >= reconcileTotal
          ? 'Finalizando…'
          : 'Conciliando'
        : 'Procesando';

  useEffect(() => {
    const prev = lastStatusRef.current;
    if (prev !== currentStatus && TERMINAL.includes(currentStatus)) {
      router.refresh();
    }
    lastStatusRef.current = currentStatus;
  }, [currentStatus, router]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-[#65758b] uppercase">Estado</p>
          <div className="mt-2 flex items-center gap-3">
            <StatusPill status={currentStatus} />
            {inProgress && (
              <CircularProgress
                done={reconcileDone}
                total={reconcileTotal}
                size={48}
                label={progressLabel}
              />
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

      {children}
    </>
  );
}
