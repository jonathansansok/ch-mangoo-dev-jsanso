import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/infra/db/prisma', () => ({
  prisma: {
    offer: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/infra/offer/pipeline', () => ({
  processOfferPipeline: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/infra/db/prisma';
import { processOfferPipeline } from '@/infra/offer/pipeline';
import { uploadOffer } from './actions';
import { MAX_OFFER_FILE_SIZE } from './schema';

const findUniqueMock = vi.mocked(prisma.offer.findUnique);
const createMock = vi.mocked(prisma.offer.create);
const pipelineMock = vi.mocked(processOfferPipeline);

function makeFormData(file: File, requestId: string | number = '1'): FormData {
  const fd = new FormData();
  fd.set('requestId', String(requestId));
  fd.set('file', file);
  return fd;
}

function makePdfFile(name = 'x.pdf', size = 1024): File {
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type: 'application/pdf' });
}

describe('uploadOffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: 99 } as never);
  });

  it('crea Offer PENDING y dispara pipeline en background', async () => {
    const result = await uploadOffer(makeFormData(makePdfFile()));
    expect(result.offerId).toBe(99);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]!.data.status).toBe('PENDING');
    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock.mock.calls[0]![0]!.offerId).toBe(99);
  });

  it('reutiliza Offer existente si hash coincide (cache hit)', async () => {
    findUniqueMock.mockResolvedValue({ id: 7 } as never);
    const result = await uploadOffer(makeFormData(makePdfFile()));
    expect(result.offerId).toBe(7);
    expect(createMock).not.toHaveBeenCalled();
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it('rechaza archivos no-PDF', async () => {
    const file = new File(['hola'], 'a.txt', { type: 'text/plain' });
    await expect(uploadOffer(makeFormData(file))).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza archivos > 10MB', async () => {
    const big = makePdfFile('big.pdf', MAX_OFFER_FILE_SIZE + 1);
    await expect(uploadOffer(makeFormData(big))).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza requestId inválido', async () => {
    await expect(uploadOffer(makeFormData(makePdfFile(), 'abc'))).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  });
});
