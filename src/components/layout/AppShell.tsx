'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar onMenuClick={() => setMobileOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="min-h-0 min-w-0 flex-1 bg-[#edebf2]">
          <main className="h-full overflow-y-auto px-4 py-4 md:px-[69px] md:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
