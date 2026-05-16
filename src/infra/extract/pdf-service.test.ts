import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/env', () => ({
  env: { EXTRACT_MODEL: 'gpt-4o-mini' },
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
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
  },
}));

import pdfParse from 'pdf-parse';
import { callChat } from '@/infra/ai/call-chat';
import { prisma } from '@/infra/db/prisma';
import { extractPdf, PdfExtractError } from './pdf-service';

const pdfParseMock = vi.mocked(pdfParse);
const callChatMock = vi.mocked(callChat);
const findUniqueMock = vi.mocked(prisma.extractionCache.findUnique);
const upsertMock = vi.mocked(prisma.extractionCache.upsert);

function makeBuffer(content = 'pdf-bytes'): Buffer {
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

describe('extractPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve payload de cache sin llamar a pdf-parse ni a OpenAI', async () => {
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
    expect(result.meta.model).toBe('gpt-4o-mini');
    expect(result.items).toHaveLength(1);
    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('camino A texto: pdf-parse + callChat + save en cache', async () => {
    findUniqueMock.mockResolvedValue(null);
    pdfParseMock.mockResolvedValue({
      text: 'A'.repeat(500),
      numpages: 1,
      info: {},
      metadata: null,
      version: '1',
      numrender: 0,
    } as never);
    const offer = makeExtractedOffer();
    callChatMock.mockResolvedValue({
      data: offer,
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
    expect(result.meta.strategy).toBe('text');
    expect(result.items[0]!.description).toBe('Boligrafo azul');
    expect(callChatMock).toHaveBeenCalledTimes(1);
    expect(callChatMock.mock.calls[0]![0]!.offerId).toBe(42);
    expect(callChatMock.mock.calls[0]![0]!.kind).toBe('EXTRACT_ITEMS');
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('si pdf-parse tira encrypted → PdfExtractError encrypted_pdf', async () => {
    findUniqueMock.mockResolvedValue(null);
    pdfParseMock.mockRejectedValue(new Error('PDF is encrypted'));

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toMatchObject({
      name: 'PdfExtractError',
      reason: 'encrypted_pdf',
    });
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('texto muy corto → no_text_extracted', async () => {
    findUniqueMock.mockResolvedValue(null);
    pdfParseMock.mockResolvedValue({
      text: 'short',
      numpages: 1,
      info: {},
      metadata: null,
      version: '1',
      numrender: 0,
    } as never);

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toMatchObject({
      name: 'PdfExtractError',
      reason: 'no_text_extracted',
    });
    expect(callChatMock).not.toHaveBeenCalled();
  });

  it('si callChat rompe schema → schema_validation_failed y no se guarda cache', async () => {
    findUniqueMock.mockResolvedValue(null);
    pdfParseMock.mockResolvedValue({
      text: 'A'.repeat(500),
      numpages: 1,
      info: {},
      metadata: null,
      version: '1',
      numrender: 0,
    } as never);
    callChatMock.mockRejectedValue(new Error('Schema inválido: items.0.description: required'));

    await expect(
      extractPdf({ buffer: makeBuffer(), fileName: 'x.pdf', mime: 'application/pdf' }),
    ).rejects.toBeInstanceOf(PdfExtractError);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
