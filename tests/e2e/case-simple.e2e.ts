import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupServer } from 'msw/node';
import { createOpenAIHandlers } from '../mocks/openai';
import { parseGuide } from '../mocks/match-table';
import { disconnectTestPrisma, getTestPrisma, isDbReachable, truncateAll } from '../helpers/db';
import { createOfferRow, seedScenario } from '../helpers/seed';

vi.mock('server-only', () => ({}));

const SCENARIO = 'case-simple';
const OFFER_FILE = 'oferta_oficenter_norte.xlsx';
const OFFER_PATH = resolve('fixtures/scenarios', SCENARIO, 'offers', OFFER_FILE);

const table = parseGuide(SCENARIO, OFFER_FILE);
const server = setupServer(...createOpenAIHandlers({ table }));

let dbAvailable = false;

beforeAll(async () => {
  const prisma = getTestPrisma();
  dbAvailable = await isDbReachable(prisma);
  if (!dbAvailable) return;
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterAll(async () => {
  if (!dbAvailable) return;
  server.close();
  await disconnectTestPrisma();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  server.resetHandlers(...createOpenAIHandlers({ table }));
  await truncateAll(getTestPrisma());
});

describe.skipIf(!process.env['DATABASE_URL_TEST'])(
  'e2e case-simple (XLSX, MSW-mocked OpenAI)',
  () => {
    it('procesa oferta_oficenter_norte.xlsx end-to-end y deja Reconciliation consistente', async () => {
      const prisma = getTestPrisma();
      const seeded = await seedScenario(prisma, SCENARIO);
      expect(seeded.itemCount).toBe(6);

      const buffer = readFileSync(OFFER_PATH);
      const { sha256 } = await import('@/lib/hash');
      const hash = sha256(buffer);
      const offerId = await createOfferRow(prisma, seeded.requestId, {
        name: OFFER_FILE,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        hash,
      });

      const { processOfferPipeline } = await import('@/infra/offer/pipeline');
      await processOfferPipeline({
        offerId,
        buffer,
        fileName: OFFER_FILE,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const offer = await prisma.offer.findUniqueOrThrow({
        where: { id: offerId },
        include: { items: true, reconciliation: { include: { lines: true } } },
      });

      expect(offer.status).toBe('RECONCILED');
      expect(offer.items.length).toBeGreaterThanOrEqual(6);
      const reconciliation = offer.reconciliation;
      if (!reconciliation) throw new Error('reconciliation missing');

      expect(reconciliation.completedAt).not.toBeNull();
      expect(reconciliation.lines.length).toBeGreaterThanOrEqual(7);

      const byRelation = new Map<string, number>();
      for (const line of reconciliation.lines) {
        byRelation.set(line.relation, (byRelation.get(line.relation) ?? 0) + 1);
      }

      expect(
        (byRelation.get('MATCH') ?? 0) + (byRelation.get('PARTIAL_QUANTITY') ?? 0),
      ).toBeGreaterThanOrEqual(5);
      expect(byRelation.get('EXTRA') ?? 0).toBeGreaterThanOrEqual(1);
      expect(byRelation.get('MISSING_FROM_OFFER') ?? 0).toBe(0);
    });
  },
);
