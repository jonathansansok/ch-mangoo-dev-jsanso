'use client';

import { type ReactNode } from 'react';
import { useUrlState } from '@/lib/use-url-state';
import { Tabs, type TabDef } from '@/components/ui/Tabs';

export type OfferTabKey = 'oferta' | 'conciliacion' | 'resumen' | 'trazabilidad';

const TABS: readonly TabDef<OfferTabKey>[] = [
  { key: 'oferta', label: 'Oferta' },
  { key: 'conciliacion', label: 'Conciliación' },
  { key: 'resumen', label: 'Resumen' },
  { key: 'trazabilidad', label: 'Trazabilidad' },
];

function isOfferTabKey(v: string | null): v is OfferTabKey {
  return v === 'oferta' || v === 'conciliacion' || v === 'resumen' || v === 'trazabilidad';
}

interface Props {
  panels: Record<OfferTabKey, ReactNode>;
}

export function OfferTabs({ panels }: Props) {
  const { params, setParam } = useUrlState();
  const active = isOfferTabKey(params.get('tab')) ? (params.get('tab') as OfferTabKey) : 'oferta';

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        tabs={TABS}
        value={active}
        onChange={(k) => setParam('tab', k === 'oferta' ? null : k)}
      />
      <div>{panels[active]}</div>
    </div>
  );
}
