'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UploadZone } from '@/components/ui/UploadZone';
import { uploadOffer } from '../actions';
import { MAX_OFFER_FILE_SIZE } from '../schema';

interface RequestOption {
  id: number;
  externalId: string;
  title: string;
}

export function UploadForm({ requests }: { requests: RequestOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [requestId, setRequestId] = useState<string>(requests[0]?.id.toString() ?? '');
  const [file, setFile] = useState<File | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error('Seleccioná un archivo PDF o XLSX');
      return;
    }
    if (!requestId) {
      toast.error('Seleccioná una solicitud');
      return;
    }

    const fd = new FormData();
    fd.set('requestId', requestId);
    fd.set('file', file);

    startTransition(async () => {
      try {
        const { offerId } = await uploadOffer(fd);
        toast.success('Oferta cargada, procesando…', { duration: 2500 });
        router.push(`/ofertas/${offerId}` as never);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error subiendo oferta';
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[#2f458a]">Solicitud de compra</span>
        <select
          value={requestId}
          onChange={(e) => setRequestId(e.target.value)}
          disabled={pending || requests.length === 0}
          className="select-chevron rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] focus:border-[#2f458a] focus:outline-none"
        >
          {requests.length === 0 && <option value="">No hay solicitudes cargadas</option>}
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.externalId} — {r.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[#2f458a]">Archivo</span>
        <UploadZone
          file={file}
          onChange={setFile}
          accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          maxSize={MAX_OFFER_FILE_SIZE}
          disabled={pending}
        />
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !file || !requestId}
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--company-primary)' }}
        >
          {pending ? 'Procesando…' : 'Procesar oferta'}
        </button>
      </div>
    </form>
  );
}
