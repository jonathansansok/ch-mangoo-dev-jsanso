import { GitCompareArrows } from 'lucide-react';
import { prisma } from '@/infra/db/prisma';
import { listReconciliations } from '@/core/queries/reconciliations-list';
import { aggregateReconciliations } from '@/core/queries/reconciliations-aggregate';
import { ConciliacionesKpis } from './ConciliacionesKpis';
import { ConciliacionesFilters } from './ConciliacionesFilters';
import { ConciliacionesTable } from './ConciliacionesTable';
import { parseFilters } from './filter-params';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadFilterOptions() {
  const [requests, suppliers] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { offers: { some: { reconciliation: { isNot: null } } } },
      select: { id: true, externalId: true, title: true },
      orderBy: { externalId: 'asc' },
    }),
    prisma.offer.findMany({
      where: { reconciliation: { isNot: null }, supplierName: { not: null } },
      select: { supplierName: true },
      distinct: ['supplierName'],
      orderBy: { supplierName: 'asc' },
    }),
  ]);
  return {
    requests,
    suppliers: suppliers
      .map((s) => s.supplierName)
      .filter((s): s is string => s !== null && s.length > 0),
  };
}

export default async function ConciliacionesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [items, stats, options] = await Promise.all([
    listReconciliations(filters),
    aggregateReconciliations(filters),
    loadFilterOptions(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2.5">
        <GitCompareArrows className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
        <div>
          <h1 className="text-2xl leading-tight font-bold text-[#2f458a] md:text-[28px]">
            Conciliaciones
          </h1>
          <p className="text-sm text-[#65758b]">
            Resultado de cada oferta cruzada contra su solicitud de compra
          </p>
        </div>
      </div>

      <ConciliacionesKpis stats={stats} />
      <ConciliacionesFilters requests={options.requests} suppliers={options.suppliers} />
      <ConciliacionesTable items={items} />
    </div>
  );
}
