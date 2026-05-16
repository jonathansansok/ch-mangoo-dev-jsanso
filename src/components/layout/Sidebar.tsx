'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, GitCompareArrows, History, LayoutDashboard, Package } from 'lucide-react';

const items = [
  { href: '/home', label: 'Inicio', Icon: LayoutDashboard },
  { href: '/solicitudes', label: 'Solicitudes', Icon: FileText },
  { href: '/ofertas', label: 'Ofertas', Icon: Package },
  { href: '/conciliaciones', label: 'Conciliaciones', Icon: GitCompareArrows },
  { href: '/trazabilidad', label: 'Trazabilidad', Icon: History },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-[#d1d5db] bg-white px-3 py-6">
      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href as never}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-150"
              style={
                active
                  ? { backgroundColor: 'var(--company-primary)', color: 'white' }
                  : { color: 'var(--company-primary)' }
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
