import Link from 'next/link';
import { Package } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <Package className="h-12 w-12 text-[#65758b]" />
      <h1 className="text-2xl font-bold text-[#2f458a]">Oferta no encontrada</h1>
      <p className="text-sm text-[#65758b]">El identificador no corresponde a ninguna oferta.</p>
      <Link
        href="/ofertas"
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--company-primary)' }}
      >
        Volver a ofertas
      </Link>
    </div>
  );
}
