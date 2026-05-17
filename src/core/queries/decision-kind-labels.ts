import type { DecisionKind } from '@prisma/client';

export const KIND_LABELS: Record<DecisionKind, string> = {
  EXTRACT_HEADER: 'Datos del proveedor',
  EXTRACT_ITEMS: 'Ítems de la oferta',
  EMBED_REQUEST: 'Preparación de la solicitud',
  EMBED_OFFER: 'Preparación de la oferta',
  JUDGE_BATCH: 'Conciliación de ítems',
};

export function kindLabel(kind: DecisionKind): string {
  return KIND_LABELS[kind];
}

export const KIND_ORDER: readonly DecisionKind[] = [
  'EXTRACT_HEADER',
  'EXTRACT_ITEMS',
  'EMBED_REQUEST',
  'EMBED_OFFER',
  'JUDGE_BATCH',
];
