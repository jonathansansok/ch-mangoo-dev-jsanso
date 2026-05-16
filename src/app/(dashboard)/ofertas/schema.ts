import { z } from 'zod';

export const MAX_OFFER_FILE_SIZE = 10 * 1024 * 1024;

export const SUPPORTED_OFFER_MIMES = ['application/pdf'] as const;

export const UploadOfferSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'Archivo vacío')
    .refine((f) => f.size <= MAX_OFFER_FILE_SIZE, `Tamaño máximo 10MB`)
    .refine(
      (f) => (SUPPORTED_OFFER_MIMES as readonly string[]).includes(f.type),
      'Solo se acepta PDF en esta versión',
    ),
});

export type UploadOfferInput = z.infer<typeof UploadOfferSchema>;
