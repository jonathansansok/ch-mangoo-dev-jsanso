import type { OfferStatus } from '@prisma/client';

const STYLES: Record<OfferStatus, { bg: string; fg: string; label: string }> = {
  PENDING: { bg: '#f3f4f6', fg: '#4b5563', label: 'Pendiente' },
  EXTRACTING: { bg: '#fef3c7', fg: '#92400e', label: 'Extrayendo' },
  EXTRACTED: { bg: '#dbeafe', fg: '#1e40af', label: 'Extraída' },
  RECONCILING: { bg: '#fef3c7', fg: '#92400e', label: 'Conciliando' },
  RECONCILED: { bg: '#d1fae5', fg: '#065f46', label: 'Conciliada' },
  FAILED: { bg: '#fee2e2', fg: '#991b1b', label: 'Falló' },
};

export function StatusPill({ status }: { status: OfferStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}
