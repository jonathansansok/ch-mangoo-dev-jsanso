import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
  hint?: string;
}

export function StatCard({ label, value, subtitle, icon, hint }: StatCardProps) {
  return (
    <div
      title={hint}
      className="flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#a9a9a9] bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-3xl leading-none font-bold text-[var(--company-primary)] tabular-nums md:text-[45px]">
          {value}
        </span>
        {icon ? (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#edebf2] text-[#2f458a] md:h-11 md:w-11">
            {icon}
          </div>
        ) : null}
      </div>
      <span className="text-sm font-semibold whitespace-pre-line text-[#2f458a] md:text-base">
        {label}
      </span>
      {subtitle ? (
        <span className="text-xs font-bold text-[var(--company-primary)]">{subtitle}</span>
      ) : null}
    </div>
  );
}
