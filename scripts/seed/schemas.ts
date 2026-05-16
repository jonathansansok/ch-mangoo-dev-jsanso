import { z } from 'zod';

export const RequestRow = z.object({
  request_id: z.string().regex(/^REQ-[A-Z]+-\d{4}-\d{3}$/, 'request_id con formato inválido'),
  title: z.string().trim().min(1, 'title vacío'),
});

export const ItemRow = z.object({
  request_id: z.string().regex(/^REQ-[A-Z]+-\d{4}-\d{3}$/),
  item_id: z.coerce.number().int().positive(),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().nonnegative().finite(),
  unit: z.string().trim().min(1),
});

export type RequestRow = z.infer<typeof RequestRow>;
export type ItemRow = z.infer<typeof ItemRow>;
