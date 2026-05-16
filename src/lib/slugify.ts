function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function slugify(input: string | null | undefined, fallback = 'sin-nombre'): string {
  if (!input) return fallback;
  const cleaned = stripAccents(input.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function sha256Short(hash: string, length = 8): string {
  return hash.slice(0, length);
}
