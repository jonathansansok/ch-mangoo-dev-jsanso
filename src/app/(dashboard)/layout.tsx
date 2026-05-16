import type { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="min-h-0 flex-1 bg-[#edebf2]">
          <main className="h-full overflow-y-auto px-[69px] py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
