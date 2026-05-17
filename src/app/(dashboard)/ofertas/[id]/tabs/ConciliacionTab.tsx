import { ReconciliationSection } from '../ReconciliationSection';
import type { ReconciliationView } from '../types';

export function ConciliacionTab({ reconciliation }: { reconciliation: ReconciliationView | null }) {
  if (!reconciliation) {
    return (
      <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-6">
        <p className="text-sm text-[#6a7282]">
          La oferta todavía no fue conciliada. Esperá a que el estado pase a{' '}
          <span className="font-semibold text-[#2f458a]">Conciliada</span>.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ReconciliationSection reconciliation={reconciliation} />
    </div>
  );
}
