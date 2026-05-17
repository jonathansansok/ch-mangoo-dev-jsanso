import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createOpenAIHandlers } from '../mocks/openai';
import { parseGuide } from '../mocks/match-table';
import { disconnectTestPrisma, getTestPrisma, isDbReachable, truncateAll } from '../helpers/db';
import { seedScenario } from '../helpers/seed';

vi.mock('server-only', () => ({}));

const SCENARIO = 'case-simple';
const GUIDE_OFFER = 'oferta_oficenter_norte.xlsx';
const table = parseGuide(SCENARIO, GUIDE_OFFER);
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

interface SeededFixture {
  offerId: number;
  requestId: number;
  offerItemCount: number;
}

async function seedOfferReadyToReconcile(): Promise<SeededFixture> {
  const prisma = getTestPrisma();
  const seeded = await seedScenario(prisma, SCENARIO);
  const offer = await prisma.offer.create({
    data: {
      requestId: seeded.requestId,
      sourceFile: 'oferta_test.xlsx',
      sourceFileHash: `hash-${Date.now()}`,
      sourceFileMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      supplierName: 'ACME Test',
      status: 'EXTRACTED',
      items: {
        create: [
          {
            lineNumber: 1,
            description: 'Paquete de papel blanco tamanio A4 75 gramos',
            quantity: 100,
            unitPrice: 5800,
            currency: 'ARS',
            unit: 'unidad',
          },
          {
            lineNumber: 2,
            description: 'Lapicera tinta azul punta media',
            quantity: 500,
            unitPrice: 120,
            currency: 'ARS',
            unit: 'unidad',
          },
          {
            lineNumber: 3,
            description: 'Folder plastico para hojas A4',
            quantity: 200,
            unitPrice: 450,
            currency: 'ARS',
            unit: 'unidad',
          },
          {
            lineNumber: 4,
            description: 'Rotulador indeleble color negro',
            quantity: 50,
            unitPrice: 380,
            currency: 'ARS',
            unit: 'unidad',
          },
          {
            lineNumber: 5,
            description: 'Rollo cinta transparente de embalaje 48 mm',
            quantity: 120,
            unitPrice: 290,
            currency: 'ARS',
            unit: 'rollo',
          },
          {
            lineNumber: 6,
            description: 'Cuaderno A4 con tapa rigida',
            quantity: 40,
            unitPrice: 1500,
            currency: 'ARS',
            unit: 'unidad',
          },
          {
            lineNumber: 7,
            description: 'Corrector liquido formato lapicera 7 ml',
            quantity: 60,
            unitPrice: 220,
            currency: 'ARS',
            unit: 'unidad',
          },
        ],
      },
    },
    include: { items: true },
  });
  return { offerId: offer.id, requestId: seeded.requestId, offerItemCount: offer.items.length };
}

function chatCompletion(content: string) {
  return HttpResponse.json({
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  });
}

describe.skipIf(!process.env['DATABASE_URL_TEST'])(
  'reconcile bajo respuestas LLM adversariales',
  () => {
    it('schema retry: primera respuesta inválida, segunda válida → reconcilia OK', async () => {
      let chatCalls = 0;
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          chatCalls += 1;
          if (chatCalls === 1) {
            return chatCompletion('{"decisions": [{"offerItemRef": "O1", "rela');
          }
          return undefined;
        }),
      );

      const fixture = await seedOfferReadyToReconcile();
      const { reconcileOffer } = await import('@/infra/reconcile/reconcile-service');
      await reconcileOffer(fixture.offerId);

      const prisma = getTestPrisma();
      const offer = await prisma.offer.findUniqueOrThrow({
        where: { id: fixture.offerId },
        include: { reconciliation: { include: { lines: true } } },
      });
      expect(offer.status).toBe('RECONCILED');
      expect(chatCalls).toBeGreaterThanOrEqual(2);

      const recon = offer.reconciliation!;
      const matchOrPartial = recon.lines.filter(
        (l) => (l.relation === 'MATCH' || l.relation === 'PARTIAL_QUANTITY') && !l.lowConfidence,
      ).length;
      expect(matchOrPartial).toBeGreaterThanOrEqual(5);
    });

    it('judge 500 persistente: batch cae en fallback extra+lowConfidence (no FAILED)', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', () => {
          return new HttpResponse(JSON.stringify({ error: { message: 'server error' } }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }),
      );

      const fixture = await seedOfferReadyToReconcile();
      const { reconcileOffer } = await import('@/infra/reconcile/reconcile-service');
      await reconcileOffer(fixture.offerId);

      const prisma = getTestPrisma();
      const offer = await prisma.offer.findUniqueOrThrow({
        where: { id: fixture.offerId },
        include: { reconciliation: { include: { lines: true } } },
      });
      expect(offer.status).toBe('RECONCILED');

      const recon = offer.reconciliation!;
      const offerLines = recon.lines.filter((l) => l.offerItemId !== null);
      expect(offerLines.length).toBe(fixture.offerItemCount);
      for (const l of offerLines) {
        expect(l.relation).toBe('EXTRA');
        expect(l.lowConfidence).toBe(true);
        expect(l.rationale).toMatch(/invalid|inválida/i);
      }

      const missing = recon.lines.filter((l) => l.relation === 'MISSING_FROM_OFFER').length;
      expect(missing).toBe(6);
    }, 60_000);

    it('requestItemRef alucinado: línea queda EXTRA+lowConfidence, no MATCH con id nulo', async () => {
      server.use(
        http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
          const body = (await request.json()) as { messages: { role: string; content: string }[] };
          const userMsg = body.messages.find((m) => m.role === 'user')?.content ?? '';
          const offerRefs = Array.from(userMsg.matchAll(/\[(O\d+)\]\s*descripci/g)).map(
            (m) => m[1]!,
          );
          const decisions = offerRefs.map((ref) => ({
            offerItemRef: ref,
            relation: 'match',
            requestItemRef: `${ref}R99`,
            confidence: 0.9,
            rationale_short: 'alucinado',
          }));
          return chatCompletion(JSON.stringify({ decisions }));
        }),
      );

      const fixture = await seedOfferReadyToReconcile();
      const { reconcileOffer } = await import('@/infra/reconcile/reconcile-service');
      await reconcileOffer(fixture.offerId);

      const prisma = getTestPrisma();
      const offer = await prisma.offer.findUniqueOrThrow({
        where: { id: fixture.offerId },
        include: { reconciliation: { include: { lines: true } } },
      });

      const recon = offer.reconciliation!;
      const matchLines = recon.lines.filter((l) => l.relation === 'MATCH');
      for (const l of matchLines) {
        expect(l.requestItemId).not.toBeNull();
      }

      const offerLines = recon.lines.filter((l) => l.offerItemId !== null);
      const lowConfidenceOnOfferSide = offerLines.filter((l) => l.lowConfidence).length;
      expect(lowConfidenceOnOfferSide).toBeGreaterThan(0);
    });
  },
);
