import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center border-b border-[#d1d5db] bg-white px-6">
        <span className="text-xl font-bold text-[var(--company-primary)]">Conciliación OK</span>
      </header>
      <div className="min-h-0 flex-1 bg-[#edebf2]">
        <main className="h-full overflow-y-auto px-[69px] py-5">{children}</main>
      </div>
    </div>
  );
}
