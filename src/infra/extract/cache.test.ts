import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/infra/db/prisma', () => ({
  prisma: {
    extractionCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@/infra/db/prisma';
import { getCachedExtraction, saveExtraction } from './cache';

const findUniqueMock = vi.mocked(prisma.extractionCache.findUnique);
const upsertMock = vi.mocked(prisma.extractionCache.upsert);

describe('cache.getCachedExtraction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve null si no hay registro', async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await getCachedExtraction('hash-x');
    expect(result).toBeNull();
  });

  it('devuelve payload y model si hay hit', async () => {
    const payload = {
      header: { supplierName: 'X', offerDate: null, observations: null },
      items: [],
    };
    findUniqueMock.mockResolvedValue({
      id: 1,
      fileHash: 'hash-x',
      fileName: 'x.pdf',
      mime: 'application/pdf',
      payload: payload as unknown as object,
      model: 'gpt-4o-mini',
      createdAt: new Date(),
    });
    const result = await getCachedExtraction('hash-x');
    expect(result?.model).toBe('gpt-4o-mini');
    expect(result?.payload).toEqual(payload);
  });
});

describe('cache.saveExtraction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upsert con fileHash como clave', async () => {
    upsertMock.mockResolvedValue({} as never);
    await saveExtraction({
      fileHash: 'h1',
      fileName: 'a.pdf',
      mime: 'application/pdf',
      model: 'gpt-4o-mini',
      payload: { header: { supplierName: null, offerDate: null, observations: null }, items: [] },
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0]![0]!;
    expect(arg.where.fileHash).toBe('h1');
    expect(arg.create.model).toBe('gpt-4o-mini');
  });
});
