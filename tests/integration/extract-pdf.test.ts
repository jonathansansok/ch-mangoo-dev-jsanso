import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const key = process.env['OPENAI_API_KEY'] ?? '';
// CI setea OPENAI_API_KEY=sk-dummy para que callChat no rompa en boot, pero el
// test integration pega a OpenAI real y queremos saltearlo en ese caso.
const hasRealKey = key.length > 0 && !key.startsWith('sk-dummy');

vi.mock('server-only', () => ({}));

vi.mock('@/env', () => ({
  env: {
    EXTRACT_MODEL: process.env['EXTRACT_MODEL'] ?? 'gpt-4o-mini',
    OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? '',
  },
}));

vi.mock('@/infra/db/prisma', () => ({
  prisma: {
    extractionCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    decisionLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe.skipIf(!hasRealKey)('extractPdf integration (case-simple)', () => {
  it('extrae oferta_comercial_oficinas.pdf con ≥ 5 items', async () => {
    const { extractPdf } = await import('@/infra/extract/pdf-service');
    const buffer = readFileSync(
      resolve(
        __dirname,
        '../../fixtures/scenarios/case-simple/offers/oferta_comercial_oficinas.pdf',
      ),
    );

    const result = await extractPdf({
      buffer,
      fileName: 'oferta_comercial_oficinas.pdf',
      mime: 'application/pdf',
    });

    expect(result.items.length).toBeGreaterThanOrEqual(5);
    expect(result.meta.fromCache).toBe(false);
    expect(result.header.supplierName).toBeTruthy();
  }, 60_000);
});
