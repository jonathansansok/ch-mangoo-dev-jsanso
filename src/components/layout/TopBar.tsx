'use client';

import { Menu, Wand2 } from 'lucide-react';

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between bg-white pr-4 pl-4 md:h-24 md:border-b md:border-[#d1d5db] md:pr-6 md:pl-10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menú"
          className="rounded-md p-2 text-[var(--company-primary)] hover:bg-[#edebf2] md:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--company-primary)] text-white md:h-12 md:w-12">
          <Wand2 className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} />
        </div>
        <span className="text-lg font-black text-[var(--company-primary)] md:text-[25px]">
          Mangoo Dev. Sansó
        </span>
      </div>
      <div className="hidden text-sm text-[#65758b] md:block">Procesamiento de ofertas con AI</div>
    </header>
  );
}
