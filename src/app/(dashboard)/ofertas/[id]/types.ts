import type { OfferStatus } from '@prisma/client';

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
}
