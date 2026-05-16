export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] leading-tight font-bold text-[#2f458a]">Inicio</h1>
        <p className="text-sm text-[#65758b]">Vista general del sistema</p>
      </div>
      <p className="text-sm text-[#6a7282]">
        Dashboard pendiente. Subir una oferta desde{' '}
        <code className="font-mono">/ofertas/upload</code>.
      </p>
    </div>
  );
}
