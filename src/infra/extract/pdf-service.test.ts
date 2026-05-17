import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/env', () => ({
  env: { EXTRACT_MODEL: 'gpt-4o-mini' },
}));

vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock('@/infra/ai/call-chat', () => ({
  callChat: vi.fn(),
}));

vi.mock('@/infra/db/prisma', () => ({
  prisma: {
    extractionCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    offer: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { getDocumentProxy, extractText } from 'unpdf';
import { callChat } from '@/infra/ai/call-chat';
import { prisma } from '@/infra/db/prisma';
import { extractPdf, PdfExtractError } from './pdf-service';

const getDocMock = vi.mocked(getDocumentProxy);
const extractTextMock = vi.mocked(extractText);
const callChatMock = vi.mocked(callChat);
const findUniqueMock = vi.mocked(prisma.extractionCache.findUnique);
const upsertMock = vi.mocked(prisma.extractionCache.upsert);

function makeBuffer(content = '%PDF-1.4\n...mock bytes...\n%%EOF'): Buffer {
  return Buffer.from(content);
}

function makeExtractedOffer() {
  return {
    header: { supplierName: 'ACME', offerDate: '2026-01-15', observations: null },
    items: [
      {
        lineNumber: 1,
        supplierCode: 'SIP-1',
        description: 'Boligrafo azul',
        quantity: 10,
        unitPrice: 250,
        currency: 'ARS',
        unit: 'unidad',
        rawObservations: null,
      },
    ],
  };
}

function mockUnpdfText(text: string, pages = 1) {
  getDocMock.mockResolvedValue({ numPages: pages } as never);
  extractTextMock.mockResolvedValue({ text, totalPages: pages } as never);
}

describe('extractPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve payload de cache sin llamar a unpdf ni a OpenAI', async () => {
    const cached = makeExtractedOffer();
    findUniqueMock.mockResolvedValue({
      id: 1,
      fileHash: 'h',
      fileName: 'x.pdf',
      mime: 'application/pdf',
      payload: cached as unknown as object,
      model: 'gpt-4o-mini',
      createdAt: new Date(),
    });

    const result = await extractPdf({
      buffer: makeBuffer(),
      fileName: 'x.pdf',
      mime: 'application/pdf',
    });

    expect(result.meta.fromCache).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(getDocMock).not.toHaveBeenCalled();
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('camino A texto: unpdf + callChat + save en cache', async () => {
    findUniqueMock.mockResolvedValue(null);
    mockUnpdfText('A'.repeat(500));
    callChatMock.mockResolvedValue({
      data: makeExtractedOffer(),
      costUsd: 0.01,
      promptTokens: 100,
      completionTokens: 50,
      durationMs: 1234,
    });
    upsertMock.mockResolvedValue({} as never);

    const result = await extractPdf({
      buffer: makeBuffer(),
      fileName: 'x.pdf',
      mime: 'application/pdf',
      offerId: 42,
    });

    expect(result.meta.fromCache).toBe(false);
    expect(result.items[0]!.description).toBe('Boligrafo azul');
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('si unpdf tira encrypted → PdfExtractError encrypted_pdf', async () => {
    findUniqueMock.mockResolvedValue(null);
    getDocMock.mockRejectedValue(new Error('PDF is encrypted'));

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toMatchObject({ name: 'PdfExtractError', reason: 'encrypted_pdf' });
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('texto muy corto → no_text_extracted', async () => {
    findUniqueMock.mockResolvedValue(null);
    mockUnpdfText('short');

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toMatchObject({ name: 'PdfExtractError', reason: 'no_text_extracted' });
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('si callChat rompe schema → schema_validation_failed y no se guarda cache', async () => {
    findUniqueMock.mockResolvedValue(null);
    mockUnpdfText('A'.repeat(500));
    callChatMock.mockRejectedValue(new Error('Schema inválido'));

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toBeInstanceOf(PdfExtractError);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
