import { z } from 'zod';

export const ExtractedHeader = z.object({
  supplierName: z.string().nullable(),
  offerDate: z.string().nullable(),
  observations: z.string().nullable(),
});

export const ExtractedItem = z.object({
  lineNumber: z.number().int().positive(),
  supplierCode: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().nonnegative().nullable(),
  unitPrice: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  unit: z.string().nullable(),
  rawObservations: z.string().nullable(),
});

export const ExtractedOffer = z.object({
  header: ExtractedHeader,
  items: z.array(ExtractedItem).min(1),
});

export type ExtractedHeader = z.infer<typeof ExtractedHeader>;
export type ExtractedItem = z.infer<typeof ExtractedItem>;
export type ExtractedOffer = z.infer<typeof ExtractedOffer>;

export type ExtractStrategy = 'text' | 'multimodal';

export interface ExtractMeta {
  strategy: ExtractStrategy;
  model: string;
  fromCache: boolean;
}

export interface ExtractedOfferWithMeta {
  header: ExtractedHeader;
  items: ExtractedItem[];
  meta: ExtractMeta;
}
