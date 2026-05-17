'use client';

import { useState, useTransition } from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { regenerateSummary } from '../summary-actions';

interface Props {
  offerId: number;
  reconciliationId: number;
  summary: string;
}

export function SummaryActions({ offerId, reconciliationId, summary }: Props) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      .writeText(summary)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error('No se pudo copiar al portapapeles'));
  }

  function regenerate() {
    startTransition(async () => {
      const res = await regenerateSummary(reconciliationId);
      if (res.ok) toast.success('Resumen regenerado');
      else toast.error('No se pudo regenerar');
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/api/ofertas/${offerId}/summary`}
        className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--company-primary)' }}
      >
        <Download className="h-4 w-4" />
        Descargar .md
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm font-semibold text-[#2f458a] hover:bg-[#f9fafb]"
      >
        <Copy className="h-4 w-4" />
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <button
        type="button"
        onClick={regenerate}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm font-semibold text-[#2f458a] hover:bg-[#f9fafb] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Regenerando…' : 'Regenerar'}
      </button>
    </div>
  );
}
