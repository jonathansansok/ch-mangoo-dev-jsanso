const CURRENCY_PREFIX: Record<string, string> = {
  $: 'ARS',
  ar$: 'ARS',
  ars: 'ARS',
  u$s: 'USD',
  us$: 'USD',
  usd: 'USD',
  '€': 'EUR',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
};

export interface MoneyParseResult {
  amount: number | null;
  currency: string | null;
}

function detectCurrency(input: string): { currency: string | null; rest: string } {
  const lower = input.toLowerCase().trim();
  for (const [prefix, code] of Object.entries(CURRENCY_PREFIX)) {
    if (lower.startsWith(prefix)) {
      return { currency: code, rest: input.slice(prefix.length).trim() };
    }
    if (lower.endsWith(prefix)) {
      return { currency: code, rest: input.slice(0, input.length - prefix.length).trim() };
    }
  }
  return { currency: null, rest: input.trim() };
}

function parseDecimalString(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  let normalized: string;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1] !== undefined && parts[1].length <= 2) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else {
    normalized = cleaned;
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseMoney(input: string | number | null | undefined): MoneyParseResult {
  if (input === null || input === undefined) return { amount: null, currency: null };
  if (typeof input === 'number') {
    return { amount: Number.isFinite(input) ? input : null, currency: null };
  }
  const trimmed = input.trim();
  if (!trimmed) return { amount: null, currency: null };
  const { currency, rest } = detectCurrency(trimmed);
  const amount = parseDecimalString(rest);
  return { amount, currency };
}

export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return parseDecimalString(trimmed);
}
