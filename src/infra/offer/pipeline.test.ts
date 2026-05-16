import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/infra/extract/pdf-service', () => {
  class PdfExtractError extends Error {
    constructor(
      message: string,
      public reason: string,
    ) {
      super(message);
      this.name = 'PdfExtractError';
    }
  }
  return { extractPdf: vi.fn(), PdfExtractError };
});

vi.mock('@/infra/extract/xlsx-service', () => {
  class XlsxExtractError extends Error {
    constructor(
      message: string,
      public reason: string,
    ) {
      super(message);
      this.name = 'XlsxExtractError';
    }
  }
  return { extractXlsx: vi.fn(), XlsxExtractError };
});

vi.mock('./persist-extracted', () => ({
  persistExtractedOffer: vi.fn(),
}));

vi.mock('./status', () => ({
  setOfferStatus: vi.fn(),
}));

vi.mock('@/infra/reconcile/reconcile-service', () => {
  class ReconcileError extends Error {
    constructor(
      message: string,
      public reason: string,
    ) {
      super(message);
      this.name = 'ReconcileError';
    }
  }
  return { reconcileOffer: vi.fn(), ReconcileError };
});

import { extractPdf, PdfExtractError } from '@/infra/extract/pdf-service';
import { extractXlsx } from '@/infra/extract/xlsx-service';
import { reconcileOffer } from '@/infra/reconcile/reconcile-service';
import { persistExtractedOffer } from './persist-extracted';
import { setOfferStatus } from './status';
import { processOfferPipeline } from './pipeline';

const extractMock = vi.mocked(extractPdf);
const extractXlsxMock = vi.mocked(extractXlsx);
const persistMock = vi.mocked(persistExtractedOffer);
const setStatusMock = vi.mocked(setOfferStatus);
const reconcileMock = vi.mocked(reconcileOffer);

const baseArgs = {
  offerId: 42,
  buffer: Buffer.from('pdf'),
  fileName: 'x.pdf',
  mime: 'application/pdf',
};

function makeExtracted() {
  return {
    header: { supplierName: 'ACME', offerDate: null, observations: null },
    items: [
      {
        lineNumber: 1,
        supplierCode: null,
        description: 'X',
        quantity: 1,
        unitPrice: 10,
        currency: 'ARS',
        unit: 'u',
        rawObservations: null,
      },
    ],
    meta: { strategy: 'text' as const, model: 'gpt-4o-mini', fromCache: false },
  };
}

describe('processOfferPipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path: EXTRACTING → EXTRACTED → reconcile', async () => {
    extractMock.mockResolvedValue(makeExtracted());
    persistMock.mockResolvedValue();
    setStatusMock.mockResolvedValue();
    reconcileMock.mockResolvedValue();

    await processOfferPipeline(baseArgs);

    expect(setStatusMock.mock.calls.map((c) => c[1])).toEqual(['EXTRACTING', 'EXTRACTED']);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock).toHaveBeenCalledWith(42);
  });

  it('mime no soportado → FAILED unsupported_mime sin extract', async () => {
    await processOfferPipeline({
      ...baseArgs,
      fileName: 'x.txt',
      mime: 'text/plain',
    });
    expect(extractMock).not.toHaveBeenCalled();
    expect(extractXlsxMock).not.toHaveBeenCalled();
    expect(setStatusMock).toHaveBeenCalledWith(42, 'FAILED', 'unsupported_mime');
  });

  it('xlsx mime → usa extractXlsx, no extractPdf', async () => {
    extractXlsxMock.mockResolvedValue({
      ...makeExtracted(),
      meta: { strategy: 'xlsx-direct' as const, model: null, fromCache: false },
    });
    persistMock.mockResolvedValue();
    setStatusMock.mockResolvedValue();
    reconcileMock.mockResolvedValue();

    await processOfferPipeline({
      ...baseArgs,
      fileName: 'x.xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(extractXlsxMock).toHaveBeenCalledTimes(1);
    expect(extractMock).not.toHaveBeenCalled();
    expect(setStatusMock.mock.calls.map((c) => c[1])).toEqual(['EXTRACTING', 'EXTRACTED']);
  });

  it('extract tira PdfExtractError → FAILED con su reason', async () => {
    extractMock.mockRejectedValue(new PdfExtractError('encriptado', 'encrypted_pdf'));
    await processOfferPipeline(baseArgs);
    expect(setStatusMock).toHaveBeenCalledWith(42, 'FAILED', 'encrypted_pdf');
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('extract tira error desconocido → FAILED unknown', async () => {
    extractMock.mockRejectedValue(new Error('boom'));
    await processOfferPipeline(baseArgs);
    expect(setStatusMock).toHaveBeenCalledWith(42, 'FAILED', 'unknown');
  });

  it('persist tira → FAILED persist_failed', async () => {
    extractMock.mockResolvedValue(makeExtracted());
    persistMock.mockRejectedValue(new Error('db down'));
    await processOfferPipeline(baseArgs);
    const calls = setStatusMock.mock.calls.map((c) => [c[1], c[2]]);
    expect(calls).toEqual([
      ['EXTRACTING', undefined],
      ['FAILED', 'persist_failed'],
    ]);
  });
});
