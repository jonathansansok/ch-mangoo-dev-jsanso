import { ArrowLeft, Upload } from 'lucide-react';
import Link from 'next/link';
import { prisma } from '@/infra/db/prisma';
import { UploadForm } from './UploadForm';

export const dynamic = 'force-dynamic';

async function loadRequests() {
  return prisma.purchaseRequest.findMany({
    select: { id: true, externalId: true, title: true },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function UploadOfertaPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string }>;
}) {
  const [requests, params] = await Promise.all([loadRequests(), searchParams]);
  const initialRequestId =
    params.requestId && requests.some((r) => r.id.toString() === params.requestId)
      ? params.requestId
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/ofertas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-[#65758b] hover:text-[#2f458a]"
        >
          <ArrowLeft className="h-4 w-4" />
          Ofertas
        </Link>
        <div className="flex items-center gap-2.5">
          <Upload className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
          <h1 className="text-2xl leading-tight font-bold text-[#2f458a] md:text-[28px]">
            Subir oferta
          </h1>
        </div>
        <p className="text-sm text-[#65758b]">
          Asociá una oferta PDF o XLSX a una solicitud de compra existente
        </p>
      </div>

      <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-4 md:p-6">
        <UploadForm requests={requests} {...(initialRequestId ? { initialRequestId } : {})} />
      </div>
    </div>
  );
}
