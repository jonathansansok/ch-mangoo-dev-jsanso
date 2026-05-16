const UNIT_SYNONYMS: Record<string, string> = {
  m: 'metro',
  mts: 'metro',
  metros: 'metro',
  u: 'unidad',
  un: 'unidad',
  unid: 'unidad',
  unidades: 'unidad',
  uds: 'unidad',
  kg: 'kilogramo',
  kgs: 'kilogramo',
  kilo: 'kilogramo',
  kilos: 'kilogramo',
  kilogramos: 'kilogramo',
  lt: 'litro',
  lts: 'litro',
  litros: 'litro',
  cm: 'centimetro',
  centimetros: 'centimetro',
  mm: 'milimetro',
  milimetros: 'milimetro',
  pza: 'pieza',
  pzas: 'pieza',
  piezas: 'pieza',
  rollos: 'rollo',
  cajas: 'caja',
  paquetes: 'paquete',
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeText(input: string): string {
  return stripAccents(input.toLowerCase()).replace(/\s+/g, ' ').trim();
}

export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const base = normalizeText(unit);
  if (!base) return null;
  return UNIT_SYNONYMS[base] ?? base;
}

export function unitsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  if (na === null || nb === null) return true;
  return na === nb;
}

export function embedText(description: string, unit: string | null | undefined): string {
  const parts = [normalizeText(description)];
  const normalUnit = normalizeUnit(unit);
  if (normalUnit) parts.push(normalUnit);
  return parts.join(' ');
}
