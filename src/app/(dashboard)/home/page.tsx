import { FileText, GitCompareArrows, Package, TrendingUp } from 'lucide-react';
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
      <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-5">
        <p className="text-sm text-[#6a7282]">
          Subí una oferta desde la sección Ofertas para empezar la conciliación.
        </p>
      </div>
    </div>
  );
}
