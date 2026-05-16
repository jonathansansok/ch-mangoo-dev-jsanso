export function TopBar() {
  return (
    <header className="flex h-24 shrink-0 items-center justify-between bg-white pr-6 pl-10">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-[10px] bg-[var(--company-primary)] text-xl font-black text-white">
          OK
        </div>
        <span className="text-[25px] font-black text-[var(--company-primary)]">
          Conciliación OK
        </span>
      </div>
      <div className="text-sm text-[#65758b]">Procesamiento de ofertas con AI</div>
    </header>
  );
}
