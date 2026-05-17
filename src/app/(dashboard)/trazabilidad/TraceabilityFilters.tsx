'use client';

import { useUrlState } from '@/lib/use-url-state';
import { KIND_ORDER, kindLabel } from '@/core/queries/decision-kind-labels';

interface OfferOpt {
  id: number;
  label: string;
}

interface Props {
  models: readonly string[];
  offers: readonly OfferOpt[];
}

export function TraceabilityFilters({ models, offers }: Props) {
  const { params, setParams } = useUrlState();
  const kindsParam = params.get('kinds');
  const selectedKinds = kindsParam ? kindsParam.split(',') : [];
  const model = params.get('model') ?? '';
  const offerId = params.get('offerId') ?? '';

  function toggleKind(k: string) {
    const next = selectedKinds.includes(k)
      ? selectedKinds.filter((x) => x !== k)
      : [...selectedKinds, k];
    setParams({ kinds: next.length ? next.join(',') : null, cursor: null });
  }

  return (
    <div className="flex flex-col gap-3 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#65758b] sm:w-auto">
          Modelo
          <select
            value={model}
            onChange={(e) => setParams({ model: e.target.value || null, cursor: null })}
            className="select-chevron w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] sm:min-w-[200px]"
          >
            <option value="">Todos</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-full flex-col gap-1 text-xs font-semibold text-[#65758b] sm:w-auto">
          Oferta
          <select
            value={offerId}
            onChange={(e) => setParams({ offerId: e.target.value || null, cursor: null })}
            className="select-chevron w-full rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#1f2937] sm:min-w-[260px]"
          >
            <option value="">Todas</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {(selectedKinds.length > 0 || model || offerId) && (
          <button
            type="button"
            onClick={() => setParams({ kinds: null, model: null, offerId: null, cursor: null })}
            className="rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#65758b] hover:bg-[#f9fafb]"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {KIND_ORDER.map((k) => {
          const active = selectedKinds.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-150"
              style={{
                backgroundColor: active ? 'var(--company-primary)' : 'white',
                color: active ? 'white' : 'var(--company-primary)',
                borderColor: active ? 'var(--company-primary)' : '#d1d5db',
              }}
            >
              {kindLabel(k)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
