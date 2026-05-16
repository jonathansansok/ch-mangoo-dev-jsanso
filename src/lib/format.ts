const LOCALE = 'es-AR';
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

const qtyFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const intFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

const usd4Formatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const usd2Formatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateLongFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'long',
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

export function formatQty(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  return qtyFormatter.format(num);
}

export function formatInt(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  return intFormatter.format(num);
}

export function formatPrice(
  value: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  const prefix = currency ? `${currency} ` : '';
  return `${prefix}${usd2Formatter.format(num)}`;
}

export function formatUsdCost(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '—';
  if (num > 0 && num < 0.0001) return '< US$ 0,0001';
  return `US$ ${usd4Formatter.format(num)}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return dateLongFormatter.format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return dateTimeFormatter.format(d);
}

export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return timeFormatter.format(d);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${qtyFormatter.format(sec)} s`;
  const min = sec / 60;
  return `${qtyFormatter.format(min)} min`;
}
