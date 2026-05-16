const TRUNCATE_LIMIT = 10_000;

export function truncatePrompt(text: string, max = TRUNCATE_LIMIT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[... truncado, original ${text.length} chars]`;
}
