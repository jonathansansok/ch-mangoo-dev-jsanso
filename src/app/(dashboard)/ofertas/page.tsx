import { Package, Upload } from 'lucide-react';
import Link from 'next/link';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatDateTime } from '@/lib/format';
import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

async function loadOffers() {
  return prisma.offer.findMany({
    include: {
      request: { select: { externalId: true, title: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function OfertasPage() {
  const offers = await loadOffers();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-2.5">
          <Package className="h-8 w-8 shrink-0 text-[#2f458a]" />
          <h1 className="text-[28px] leading-tight font-bold text-[#2f458a]">Ofertas</h1>
          <p className="text-sm text-[#65758b]">Ofertas cargadas y su estado de procesamiento</p>
        </div>
        <Link
          href="/ofertas/upload"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--company-primary)' }}
        >
          <Upload className="h-4 w-4" />
          Subir oferta
        </Link>
      </div>

      <div className="overflow-hidden rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <table className="w-full">
          <thead className="bg-[#edebf2]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Archivo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Solicitud
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Proveedor
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Subida
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Items
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#6a7282]">
                  No hay ofertas cargadas. Empezar en{' '}
                  <Link href="/ofertas/upload" className="font-semibold text-[#2f458a] underline">
                    /ofertas/upload
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              offers.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-[#d1d5db] last:border-b-0 hover:bg-[#f9fafb]"
                >
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/ofertas/${o.id}` as never}
                      className="font-semibold text-[#2f458a] hover:underline"
                    >
                      {o.sourceFile}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#1f2937]">
                    {o.request.externalId}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#1f2937]">{o.supplierName ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-[#65758b]">
                    {formatDateTime(o.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#2f458a] tabular-nums">
                    {o._count.items}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
