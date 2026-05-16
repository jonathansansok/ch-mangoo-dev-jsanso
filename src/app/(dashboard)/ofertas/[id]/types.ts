import type { LineRelation, OfferStatus } from '@prisma/client';

export interface OfferItemView {
  id: number;
  lineNumber: number;
  supplierCode: string | null;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  currency: string | null;
  unit: string | null;
}

export interface ReconciliationLineView {
  id: number;
  relation: LineRelation;
  confidence: string;
  embeddingSimilarity: string | null;
  quantityRequested: string | null;
  quantityOffered: string | null;
  rationale: string;
  flags: string[];
  offerItem: {
    lineNumber: number;
    description: string;
    supplierCode: string | null;
  } | null;
  requestItem: {
    externalItemId: number;
    description: string;
    unit: string;
  } | null;
}

export interface ReconciliationView {
  id: number;
  itemsCovered: number;
  itemsMissing: number;
  itemsExtra: number;
  itemsPartial: number;
  itemsLowConfidence: number;
  totalCostUsd: string;
  completedAt: Date | null;
  lines: ReconciliationLineView[];
}

export interface OfferView {
  id: number;
  status: OfferStatus;
  failureReason: string | null;
  supplierName: string | null;
  offerDate: Date | null;
  observations: string | null;
  sourceFile: string;
  requestId: number;
  updatedAt: Date;
  request: { externalId: string; title: string };
  items: OfferItemView[];
  reconciliation: ReconciliationView | null;
}
