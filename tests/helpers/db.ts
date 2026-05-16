import { PrismaClient } from '@prisma/client';

let _client: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  _client ??= new PrismaClient({ log: ['error'] });
  return _client;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
  }
}

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  const tables = [
    'DecisionLog',
    'ReconciliationLine',
    'Reconciliation',
    'OfferItem',
    'Offer',
    'ExtractionCache',
    'PurchaseRequestItem',
    'PurchaseRequest',
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
}

export async function isDbReachable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
