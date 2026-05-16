import { slugify } from '@/lib/slugify';

interface FilenameInput {
  requestExternalId: string;
  supplierName: string | null;
  completedAt: Date | null;
}

export function buildSummaryFilename(input: FilenameInput): string {
  const date = (input.completedAt ?? new Date()).toISOString().slice(0, 10);
  const supplier = slugify(input.supplierName, 'sin-proveedor');
  return `oferta-${input.requestExternalId}-${supplier}-${date}.md`;
}
