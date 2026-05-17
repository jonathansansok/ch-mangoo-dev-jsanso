import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatCard } from '@/components/cards/StatCard';
import { formatQty } from '@/lib/format';
import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

async function loadRequest(id: number) {
  return prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      items: { orderBy: { externalItemId: 'asc' } },
      offers: { orderBy: { createdAt: 'desc' } },
    },
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SolicitudDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const request = await loadRequest(numericId);
  if (!request) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/solicitudes"
          className="mb-2 inline-flex items-center gap-1 text-sm text-[#65758b] hover:text-[#2f458a]"
        >
          <ArrowLeft className="h-4 w-4" />
          Solicitudes
        </Link>
        <div className="flex items-center gap-2.5">
          <FileText className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
          <h1 className="text-2xl leading-tight font-bold break-all text-[#2f458a] md:text-[28px]">
            {request.externalId}
          </h1>
        </div>
        <p className="text-sm text-[#65758b]">{request.title}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Items pedidos" value={String(request.items.length).padStart(2, '0')} />
        <StatCard
          label="Ofertas recibidas"
          value={String(request.offers.length).padStart(2, '0')}
        />
      </div>

      <div className="overflow-x-auto rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <div className="flex items-center gap-2 border-b border-[#edebf2] bg-[#edebf2] px-4 py-3">
          <span className="text-base font-semibold text-[#2f458a]">Items solicitados</span>
        </div>
        <table className="w-full">
          <thead className="bg-white">
            <tr className="border-b border-[#d1d5db]">
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Descripción
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Cantidad
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Unidad
              </th>
            </tr>
          </thead>
          <tbody>
            {request.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-[#edebf2] last:border-b-0 hover:bg-[#f9fafb]"
              >
                <td className="px-4 py-3 text-right text-sm text-[#2f458a] tabular-nums">
                  {item.externalItemId}
                </td>
                <td className="px-4 py-3 text-sm text-[#1f2937]">{item.description}</td>
                <td className="px-4 py-3 text-right text-sm text-[#1f2937] tabular-nums">
                  {formatQty(item.quantity.toString())}
                </td>
                <td className="px-4 py-3 text-sm text-[#6a7282]">{item.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
