import { FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

async function loadRequests() {
  return prisma.purchaseRequest.findMany({
    include: { _count: { select: { items: true, offers: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function SolicitudesPage() {
  const requests = await loadRequests();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <FileText className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
          <h1 className="text-2xl leading-tight font-bold text-[#2f458a] md:text-[28px]">
            Solicitudes
          </h1>
        </div>
        <p className="text-sm text-[#65758b]">Solicitudes de compra cargadas en el sistema</p>
      </div>

      <div className="overflow-x-auto rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white">
        <table className="w-full">
          <thead className="bg-[#edebf2]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                ID externo
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Título
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Items
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Ofertas
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold tracking-wide text-[#65758b] uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-[#6a7282]">
                  No hay solicitudes cargadas. Correr <code>pnpm db:seed</code> para poblar
                  fixtures.
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr
                  key={req.id}
                  className="border-b border-[#d1d5db] last:border-b-0 hover:bg-[#f9fafb]"
                >
                  <td className="px-4 py-3 font-mono text-sm text-[#2f458a]">
                    <Link
                      href={`/solicitudes/${req.id}` as never}
                      className="font-semibold hover:underline"
                    >
                      {req.externalId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#1f2937]">{req.title}</td>
                  <td className="px-4 py-3 text-right text-sm text-[#2f458a] tabular-nums">
                    {req._count.items}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-[#2f458a] tabular-nums">
                    {req._count.offers}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/ofertas/upload?requestId=${req.id}` as never}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#2f458a] px-3 py-1.5 text-xs font-semibold text-[#2f458a] transition-colors hover:bg-[#2f458a] hover:text-white"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Subir oferta
                    </Link>
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
