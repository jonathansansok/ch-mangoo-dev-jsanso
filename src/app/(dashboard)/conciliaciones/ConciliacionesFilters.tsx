'use client';

import { useUrlState } from '@/lib/use-url-state';

interface RequestOption {
  id: number;
  externalId: string;
  title: string;
}

interface FiltersProps {
  requests: readonly RequestOption[];
  suppliers: readonly string[];
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'coverage_desc', label: 'Mayor cobertura' },
  { value: 'cost_desc', label: 'Mayor costo' },
] as const;

export function ConciliacionesFilters({ requests, suppliers }: FiltersProps) {
  const { params, setParam } = useUrlState();
  const requestId = params.get('requestId') ?? '';
  const supplier = params.get('supplier') ?? '';
  const sort = params.get('sort') ?? 'recent';

  return (
    <div className="flex flex-col gap-3 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#65758b] sm:w-auto">
        Solicitud
        <select
          value={requestId}
          onChange={(e) => setParam('requestId', e.target.value || null)}
          className="select-chevron w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] sm:min-w-[220px]"
        >
          <option value="">Todas</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.externalId} — {r.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#65758b] sm:w-auto">
        Proveedor
        <select
          value={supplier}
          onChange={(e) => setParam('supplier', e.target.value || null)}
          className="select-chevron w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] sm:min-w-[200px]"
        >
          <option value="">Todos</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#65758b] sm:w-auto">
        Ordenar
        <select
          value={sort}
          onChange={(e) => setParam('sort', e.target.value === 'recent' ? null : e.target.value)}
          className="select-chevron w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] sm:w-auto"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {(requestId || supplier || sort !== 'recent') && (
        <button
          type="button"
          onClick={() => {
            setParam('requestId', null);
            setParam('supplier', null);
            setParam('sort', null);
          }}
          className="rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#65758b] hover:bg-[#f9fafb]"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
