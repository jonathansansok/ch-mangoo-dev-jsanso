import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { disconnectTestPrisma, getTestPrisma, isDbReachable, truncateAll } from '../helpers/db';
import { createOfferRow, seedScenario } from '../helpers/seed';

vi.mock('server-only', () => ({}));

const key = process.env['OPENAI_API_KEY'] ?? '';
const hasRealKey = key.length > 0 && !key.startsWith('sk-dummy') && !key.startsWith('sk-test');
const shouldRun = hasRealKey && Boolean(process.env['DATABASE_URL_TEST']);

const SCENARIO = 'case-complex';
const OFFER_FILE = 'oferta_mantenimiento_integral.pdf';
const OFFER_PATH = resolve('fixtures/scenarios', SCENARIO, 'offers', OFFER_FILE);

let dbAvailable = false;

beforeAll(async () => {
  if (!shouldRun) return;
  const prisma = getTestPrisma();
  dbAvailable = await isDbReachable(prisma);
});

afterAll(async () => {
  if (!shouldRun) return;
  await disconnectTestPrisma();
});

beforeEach(async () => {
  if (!shouldRun || !dbAvailable) return;
  await truncateAll(getTestPrisma());
});

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').toLowerCase();
}

function numericVariants(value: number): string[] {
  const out = new Set<string>();
  const isWhole = Number.isInteger(value);
  out.add(String(value));
  out.add(value.toFixed(2));
  if (isWhole) {
    out.add(String(Math.trunc(value)));
  }
  const enThousands = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const arThousands = value.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  out.add(enThousands);
  out.add(arThousands);
  if (isWhole) {
    out.add(value.toLocaleString('en-US', { maximumFractionDigits: 0 }));
    out.add(value.toLocaleString('es-AR', { maximumFractionDigits: 0 }));
  }
  return [...out].map(normalizeText).filter((s) => s.length > 0);
}

describe.skipIf(!shouldRun)('e2e — fidelidad numérica con OpenAI real', () => {
  it('precios y cantidades extraídos aparecen en el texto del PDF (sin alucinaciones numéricas)', async () => {
    const prisma = getTestPrisma();
    const seeded = await seedScenario(prisma, SCENARIO);
    expect(seeded.itemCount).toBe(220);

    const buffer = readFileSync(OFFER_PATH);
    const { sha256 } = await import('@/lib/hash');
    const hash = sha256(buffer);
    const offerId = await createOfferRow(prisma, seeded.requestId, {
      name: OFFER_FILE,
      mime: 'application/pdf',
      hash,
    });

    const { processOfferPipeline } = await import('@/infra/offer/pipeline');
    await processOfferPipeline({
      offerId,
      buffer,
      fileName: OFFER_FILE,
      mime: 'application/pdf',
    });

    const offer = await prisma.offer.findUniqueOrThrow({
      where: { id: offerId },
      include: { items: true, reconciliation: { include: { lines: true } } },
    });
    expect(offer.status).toBe('RECONCILED');
    expect(offer.items.length).toBeGreaterThan(150);

    const unpdf = await import('unpdf');
    const freshBuffer = readFileSync(OFFER_PATH);
    const pdfBytes = new Uint8Array(
      freshBuffer.buffer.slice(
        freshBuffer.byteOffset,
        freshBuffer.byteOffset + freshBuffer.byteLength,
      ),
    );
    const pdf = await unpdf.getDocumentProxy(pdfBytes);
    const { text: rawTextRaw } = await unpdf.extractText(pdf, { mergePages: true });
    const rawText = normalizeText(Array.isArray(rawTextRaw) ? rawTextRaw.join(' ') : rawTextRaw);

    let priceMisses = 0;
    let qtyMisses = 0;
    const missExamples: string[] = [];

    for (const item of offer.items) {
      if (item.unitPrice !== null) {
        const variants = numericVariants(Number(item.unitPrice));
        const found = variants.some((v) => rawText.includes(v));
        if (!found) {
          priceMisses += 1;
          if (missExamples.length < 5) {
            missExamples.push(`price ${item.unitPrice} no aparece para "${item.description}"`);
          }
        }
      }
      if (item.quantity !== null) {
        const variants = numericVariants(Number(item.quantity));
        const found = variants.some((v) => rawText.includes(v));
        if (!found) {
          qtyMisses += 1;
          if (missExamples.length < 10) {
            missExamples.push(`qty ${item.quantity} no aparece para "${item.description}"`);
          }
        }
      }
    }

    const total = offer.items.length;
    const priceMissRate = priceMisses / total;
    const qtyMissRate = qtyMisses / total;

    if (priceMissRate > 0.01 || qtyMissRate > 0.01) {
      throw new Error(
        `Tasa de alucinación numérica supera 1%: priceMisses=${priceMisses}/${total}, qtyMisses=${qtyMisses}/${total}.\nEjemplos:\n${missExamples.join('\n')}`,
      );
    }

    const recon = offer.reconciliation!;
    const matchLines = recon.lines.filter((l) => l.relation === 'MATCH');
    for (const l of matchLines) {
      expect(l.requestItemId).not.toBeNull();
    }

    const covered = recon.lines.filter(
      (l) => l.relation === 'MATCH' || l.relation === 'PARTIAL_QUANTITY',
    ).length;
    const missing = recon.lines.filter((l) => l.relation === 'MISSING_FROM_OFFER').length;
    expect(covered + missing).toBe(seeded.itemCount);

    expect(Number(recon.totalCostUsd)).toBeLessThan(0.15);
  }, 600_000);
});
