'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, GitCompareArrows, History, LayoutDashboard, Package, X } from 'lucide-react';

const items = [
  { href: '/home', label: 'Inicio', Icon: LayoutDashboard },
  { href: '/solicitudes', label: 'Solicitudes', Icon: FileText },
  { href: '/ofertas', label: 'Ofertas', Icon: Package },
  { href: '/conciliaciones', label: 'Conciliaciones', Icon: GitCompareArrows },
  { href: '/trazabilidad', label: 'Trazabilidad', Icon: History },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-[#d1d5db] bg-white px-3 py-6 md:block">
        <NavList pathname={pathname} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <div className="absolute inset-0 flex w-full flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d1d5db] px-5 py-4">
              <span className="text-xl font-bold text-[var(--company-primary)]">Menú</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-md p-2 text-[#65758b] hover:bg-[#edebf2] hover:text-[var(--company-primary)]"
              >
                <X className="h-7 w-7" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <NavList pathname={pathname} onNavigate={onClose} mobile />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavList({
  pathname,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const linkClass = mobile
    ? 'flex items-center gap-3 rounded-xl px-4 py-4 text-lg font-semibold transition-colors duration-150'
    : 'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-150';
  const iconClass = mobile ? 'h-7 w-7 shrink-0' : 'h-5 w-5 shrink-0';
  return (
    <nav className={mobile ? 'flex flex-col gap-2' : 'flex flex-col gap-1'}>
      {items.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href as never}
            onClick={() => onNavigate?.()}
            className={linkClass}
            style={
              active
                ? { backgroundColor: 'var(--company-primary)', color: 'white' }
                : { color: 'var(--company-primary)' }
            }
          >
            <Icon className={iconClass} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
