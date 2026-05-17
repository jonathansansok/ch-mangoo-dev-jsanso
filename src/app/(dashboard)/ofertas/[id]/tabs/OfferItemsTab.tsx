'use client';

import type { OfferStatus } from '@prisma/client';
import { formatPrice, formatQty } from '@/lib/format';
import type { OfferItemView } from '../types';

const TERMINAL: ReadonlyArray<OfferStatus> = ['EXTRACTED', 'RECONCILED', 'FAILED'];

interface Props {
  items: readonly OfferItemView[];
  status: OfferStatus;
}

export function OfferItemsTab({ items, status }: Props) {
  return (
    <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
      <div className="flex items-center gap-2 border-b border-[#edebf2] bg-[#edebf2] px-4 py-3">
        <span className="text-base font-semibold text-[#2f458a]">Items ofertados</span>
        <span className="text-xs text-[#65758b]">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[#6a7282]">
          {TERMINAL.includes(status)
            ? 'No se extrajeron items de esta oferta.'
            : 'Aún no hay items extraídos. Esperando procesamiento…'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-white">
              <tr className="border-b border-[#d1d5db]">
                <Th align="right">#</Th>
                <Th>Código</Th>
                <Th>Descripción</Th>
                <Th align="right">Cantidad</Th>
                <Th>Unidad</Th>
                <Th align="right">Precio</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
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
                    {formatQty(item.quantity)}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#6a7282]">{item.unit ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                    {formatPrice(item.unitPrice, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
