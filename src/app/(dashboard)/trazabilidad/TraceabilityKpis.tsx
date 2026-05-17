import { Activity, Wallet, Cpu, Layers } from 'lucide-react';
import { StatCard } from '@/components/cards/StatCard';
import { formatInt, formatUsdCost } from '@/lib/format';
import type { TraceabilityAggregate } from '@/core/queries/traceability-aggregate';

export function TraceabilityKpis({ stats }: { stats: TraceabilityAggregate }) {
  const totalTokens = stats.totalPromptTokens + stats.totalCompletionTokens;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Llamadas al LLM"
        value={formatInt(stats.totalCalls)}
        icon={<Activity className="h-5 w-5" />}
        subtitle={`${formatInt(stats.uniqueOffers)} ofertas`}
      />
      <StatCard
        label="Tokens (in + out)"
        value={formatInt(totalTokens)}
        icon={<Cpu className="h-5 w-5" />}
        subtitle={`${formatInt(stats.totalPromptTokens)} in · ${formatInt(stats.totalCompletionTokens)} out`}
      />
      <StatCard
        label="Costo acumulado"
        value={formatUsdCost(stats.totalCostUsd)}
        icon={<Wallet className="h-5 w-5" />}
      />
      <StatCard
        label="Costo prom. por oferta"
        value={formatUsdCost(stats.avgCostPerOfferUsd)}
        icon={<Layers className="h-5 w-5" />}
      />
    </div>
  );
}
