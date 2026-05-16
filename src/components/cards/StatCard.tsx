import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-2 rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#a9a9a9] bg-white p-4">
      <div className="flex items-start justify-between">
        <span className="text-[45px] leading-none font-bold text-[var(--company-primary)] tabular-nums">
          {value}
        </span>
        {icon ? (
          <div className="grid h-11 w-11 place-items-center rounded-[10px] bg-[#edebf2] text-[#2f458a]">
            {icon}
          </div>
        ) : null}
      </div>
      <span className="text-base font-semibold whitespace-pre-line text-[#2f458a]">{label}</span>
      {subtitle ? (
        <span className="text-xs font-bold text-[var(--company-primary)]">{subtitle}</span>
      ) : null}
    </div>
  );
}
