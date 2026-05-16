import type { PrismaClient } from '@prisma/client';
import type { ItemRow, RequestRow } from './schemas';

export async function upsertRequest(prisma: PrismaClient, row: RequestRow): Promise<number> {
  const created = await prisma.purchaseRequest.upsert({
    where: { externalId: row.request_id },
    update: { title: row.title },
    create: { externalId: row.request_id, title: row.title },
    select: { id: true },
  });
  return created.id;
}

export async function upsertItem(
  prisma: PrismaClient,
  requestId: number,
  row: ItemRow,
): Promise<void> {
  await prisma.purchaseRequestItem.upsert({
    where: {
      requestId_externalItemId: {
        requestId,
        externalItemId: row.item_id,
      },
    },
    update: {
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
    },
    create: {
      requestId,
      externalItemId: row.item_id,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
    },
  });
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.purchaseRequestItem.deleteMany({}),
    prisma.purchaseRequest.deleteMany({}),
  ]);
}
