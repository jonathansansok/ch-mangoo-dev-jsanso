import { Upload } from 'lucide-react';
import { prisma } from '@/infra/db/prisma';
import { UploadForm } from './UploadForm';

export const dynamic = 'force-dynamic';

async function loadRequests() {
  return prisma.purchaseRequest.findMany({
    select: { id: true, externalId: true, title: true },
    orderBy: { createdAt: 'desc' },
  });
}

export default async function UploadOfertaPage() {
  const requests = await loadRequests();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-2.5">
        <Upload className="h-8 w-8 shrink-0 text-[#2f458a]" />
        <h1 className="text-[28px] leading-tight font-bold text-[#2f458a]">Subir oferta</h1>
        <p className="text-sm text-[#65758b]">
          Asociá una oferta PDF a una solicitud de compra existente
        </p>
      </div>

      <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-6">
        <UploadForm requests={requests} />
      </div>
    </div>
  );
}
