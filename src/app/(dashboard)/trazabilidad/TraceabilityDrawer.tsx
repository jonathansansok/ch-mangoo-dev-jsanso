'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { KindBadge } from './KindBadge';
import { formatDateTime, formatDuration, formatInt, formatUsdCost } from '@/lib/format';

interface DetailResponse {
  id: string;
  offerId: number | null;
  reconciliationLineId: number | null;
  kind: 'EXTRACT_HEADER' | 'EXTRACT_ITEMS' | 'EMBED_REQUEST' | 'EMBED_OFFER' | 'JUDGE_BATCH';
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: string;
  prompt: string;
  rawResponse: string;
  candidatesConsidered: unknown;
}

interface DrawerProps {
  id: string | null;
  onClose: () => void;
}

export function TraceabilityDrawer({ id, onClose }: DrawerProps) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/traceability/detail/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Drawer open={id !== null} onClose={onClose} title="Detalle de decisión">
      {loading && <p className="text-sm text-[#65758b]">Cargando…</p>}
      {error && <p className="text-sm text-red-700">Error: {error}</p>}
      {detail && <DetailBody detail={detail} />}
    </Drawer>
  );
}

function DetailBody({ detail }: { detail: DetailResponse }) {
  const candidates = parseCandidates(detail.candidatesConsidered);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="mb-2 flex items-center gap-2">
          <KindBadge kind={detail.kind} />
          <span className="font-mono text-xs text-[#65758b]">#{detail.id}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <DT>Modelo</DT>
          <DD>{detail.model}</DD>
          <DT>Hora</DT>
          <DD>{formatDateTime(detail.createdAt)}</DD>
          <DT>Tokens (in / out)</DT>
          <DD>
            {formatInt(detail.promptTokens)} / {formatInt(detail.completionTokens)}
          </DD>
          <DT>Costo</DT>
          <DD>{formatUsdCost(detail.costUsd)}</DD>
          <DT>Duración</DT>
          <DD>{formatDuration(detail.durationMs)}</DD>
          {detail.offerId !== null && (
            <>
              <DT>Oferta</DT>
              <DD>
                <Link
                  href={`/ofertas/${detail.offerId}?tab=trazabilidad` as never}
                  className="text-[#2f458a] hover:underline"
                >
                  /ofertas/{detail.offerId}
                </Link>
              </DD>
            </>
          )}
          {detail.reconciliationLineId !== null && (
            <>
              <DT>Línea conciliación</DT>
              <DD>
                <span className="font-mono text-xs">#{detail.reconciliationLineId}</span>
              </DD>
            </>
          )}
        </dl>
      </section>

      <PromptBlock title="Prompt enviado" text={detail.prompt} />
      <PromptBlock title="Respuesta cruda" text={detail.rawResponse} />

      {candidates && candidates.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-[#2f458a]">Candidatos considerados</h3>
          <pre className="max-h-64 overflow-auto rounded-md border border-[#d1d5db] bg-[#f9fafb] p-3 text-[11px] text-[#1f2937]">
            {JSON.stringify(candidates, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function PromptBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = text.length >= 10_000;

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#2f458a]">{title}</h3>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-2 py-1 text-xs text-[#65758b] hover:bg-[#f9fafb]"
        >
          <Copy className="h-3 w-3" />
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-[#d1d5db] bg-[#f9fafb] p-3 text-[11px] whitespace-pre-wrap text-[#1f2937]">
        {text || '(vacío)'}
      </pre>
      {truncated && (
        <p className="mt-1 text-[11px] text-amber-700">
          Truncado a 10.000 caracteres — el prompt original puede ser más largo.
        </p>
      )}
    </section>
  );
}

function parseCandidates(raw: unknown): unknown[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') return [raw];
  return null;
}

function DT({ children }: { children: React.ReactNode }) {
  return <dt className="font-semibold text-[#65758b]">{children}</dt>;
}
function DD({ children }: { children: React.ReactNode }) {
  return <dd className="text-[#1f2937]">{children}</dd>;
}
