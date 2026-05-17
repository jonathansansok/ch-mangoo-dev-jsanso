'use client';

import { Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

const ALLOWED_KEYS = ['kinds', 'model', 'offerId', 'from', 'to'] as const;

interface Props {
  basePath: string;
}

export function TraceabilityExportButtons({ basePath }: Props) {
  const params = useSearchParams();

  function buildHref(format: 'json' | 'csv') {
    const sp = new URLSearchParams();
    for (const key of ALLOWED_KEYS) {
      const v = params.get(key);
      if (v) sp.set(key, v);
    }
    const qs = sp.toString();
    return qs ? `${basePath}/${format}?${qs}` : `${basePath}/${format}`;
  }

  return (
    <div className="flex gap-2">
      <a
        href={buildHref('json')}
        className="inline-flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#2f458a] hover:bg-[#f9fafb]"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar JSON
      </a>
      <a
        href={buildHref('csv')}
        className="inline-flex items-center gap-1 rounded-md border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#2f458a] hover:bg-[#f9fafb]"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar CSV
      </a>
    </div>
  );
}
