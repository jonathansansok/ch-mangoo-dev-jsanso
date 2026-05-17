import { GitCompareArrows, Percent, Wallet, CheckSquare } from 'lucide-react';
import { StatCard } from '@/components/cards/StatCard';
import { formatInt, formatPercent, formatUsdCost } from '@/lib/format';
import type { ReconciliationAggregate } from '@/core/queries/reconciliations-aggregate';

export function ConciliacionesKpis({ stats }: { stats: ReconciliationAggregate }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Conciliaciones"
        value={formatInt(stats.totalReconciliations)}
        icon={<GitCompareArrows className="h-5 w-5" />}
      />
      <StatCard
        label="Items conciliados"
        value={formatInt(stats.totalItemsMatched)}
        icon={<CheckSquare className="h-5 w-5" />}
      />
      <StatCard
        label="Cobertura promedio"
        value={formatPercent(stats.avgCoveragePct)}
        icon={<Percent className="h-5 w-5" />}
      />
      <StatCard
        label="Costo LLM total"
        value={formatUsdCost(stats.totalCostUsd)}
        icon={<Wallet className="h-5 w-5" />}
      />
    </div>
  );
}
