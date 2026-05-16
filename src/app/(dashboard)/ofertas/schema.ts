import { z } from 'zod';

export const MAX_OFFER_FILE_SIZE = 10 * 1024 * 1024;

export const SUPPORTED_OFFER_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
] as const;

export const SUPPORTED_OFFER_EXTENSIONS = ['.pdf', '.xlsx', '.xls'] as const;

function hasSupportedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_OFFER_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const UploadOfferSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'Archivo vacío')
    .refine((f) => f.size <= MAX_OFFER_FILE_SIZE, `Tamaño máximo 10MB`)
    .refine(
      (f) =>
        (SUPPORTED_OFFER_MIMES as readonly string[]).includes(f.type) ||
        hasSupportedExtension(f.name),
      'Formato no soportado: solo PDF o XLSX',
    ),
});

export type UploadOfferInput = z.infer<typeof UploadOfferSchema>;
