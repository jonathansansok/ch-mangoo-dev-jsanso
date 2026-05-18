import { FileText, GitCompareArrows, Package, TrendingUp, Upload } from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/cards/StatCard';
import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

async function loadStats() {
  const [requestsCount, offersCount, reconciliations] = await Promise.all([
    prisma.purchaseRequest.count(),
    prisma.offer.count({ where: { status: 'RECONCILED' } }),
    prisma.reconciliation.findMany({
      select: { itemsCovered: true, itemsMissing: true, itemsExtra: true, itemsPartial: true },
    }),
  ]);

  const matchedItems = reconciliations.reduce((sum, r) => sum + r.itemsCovered, 0);
  const totalReconciled = reconciliations.reduce(
    (sum, r) => sum + r.itemsCovered + r.itemsMissing,
    0,
  );
  const coveragePct = totalReconciled > 0 ? Math.round((matchedItems / totalReconciled) * 100) : 0;

  return { requestsCount, offersCount, matchedItems, coveragePct };
}

export default async function HomePage() {
  const stats = await loadStats();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl leading-tight font-bold text-[#2f458a] md:text-[28px]">Inicio</h1>
        <p className="text-sm text-[#65758b]">Vista general del sistema</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solicitudes activas"
          value={String(stats.requestsCount).padStart(2, '0')}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label="Ofertas procesadas"
          value={String(stats.offersCount).padStart(2, '0')}
          icon={<Package className="h-5 w-5" />}
        />
        <StatCard
          label="Items conciliados"
          value={String(stats.matchedItems).padStart(2, '0')}
          icon={<GitCompareArrows className="h-5 w-5" />}
        />
        <StatCard
          label="Cobertura promedio"
          value={`${stats.coveragePct}%`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6a7282]">
          Subí una oferta para empezar la conciliación contra las solicitudes cargadas.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/ofertas/upload"
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--company-primary)' }}
          >
            <Upload className="h-4 w-4" />
            Subir oferta
          </Link>
          <Link
            href="/solicitudes"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm font-semibold text-[#2f458a] hover:bg-[#f9fafb]"
          >
            <FileText className="h-4 w-4" />
            Ver solicitudes
          </Link>
        </div>
      </div>
    </div>
  );
}
