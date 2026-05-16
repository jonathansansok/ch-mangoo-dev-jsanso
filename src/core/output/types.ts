import type { LineRelation } from '@prisma/client';

export interface ReconciliationViewLine {
  id: number;
  relation: LineRelation;
  confidence: number;
  embeddingSimilarity: number | null;
  quantityRequested: number | null;
  quantityOffered: number | null;
  rationale: string;
  flags: string[];
  offerItem: {
    id: number;
    lineNumber: number;
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    currency: string | null;
    supplierCode: string | null;
  } | null;
  requestItem: {
    id: number;
    externalItemId: number;
    description: string;
    quantity: number;
    unit: string;
  } | null;
}

export interface ReconciliationView {
  id: number;
  offerId: number;
  itemsCovered: number;
  itemsMissing: number;
  itemsExtra: number;
  itemsPartial: number;
  itemsLowConfidence: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  decisionLogCount: number;
  createdAt: Date;
  completedAt: Date | null;
  offer: {
    id: number;
    supplierName: string | null;
    offerDate: Date | null;
    sourceFile: string;
    observations: string | null;
    createdAt: Date;
  };
  request: {
    externalId: string;
    title: string;
    totalItems: number;
  };
  models: {
    extractModel: string | null;
    judgeModel: string | null;
    embedModel: string | null;
  };
  durationMs: number;
  lines: ReconciliationViewLine[];
}
