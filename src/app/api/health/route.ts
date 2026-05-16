import { prisma } from '@/infra/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok', db: 'ok' });
  } catch {
    return Response.json({ status: 'ok', db: 'error' }, { status: 503 });
  }
}
