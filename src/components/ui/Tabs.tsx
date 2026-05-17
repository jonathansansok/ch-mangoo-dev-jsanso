'use client';

export interface TabDef<T extends string = string> {
  key: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (key: T) => void;
}

export function Tabs<T extends string>({ tabs, value, onChange }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className="-mx-1 flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-[#d1d5db] px-1 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className="shrink-0 rounded-t-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150 sm:px-4"
            style={{
              color: active ? 'white' : 'var(--company-primary)',
              backgroundColor: active ? 'var(--company-primary)' : 'transparent',
              borderBottom: active ? '2px solid var(--company-primary)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
