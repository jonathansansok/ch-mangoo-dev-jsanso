import 'server-only';
import pLimit from 'p-limit';
import { callChat } from '@/infra/ai/call-chat';
import { prisma } from '@/infra/db/prisma';
import { sha256 } from '@/lib/hash';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { normalizeOffer } from '@/core/extract/normalize';
import { buildExtractUserPrompt, EXTRACT_SYSTEM_PROMPT } from '@/core/extract/prompts';
import {
  ExtractedOffer,
  type ExtractedItem,
  type ExtractedOfferWithMeta,
} from '@/core/extract/schema';
import { extractPdfText, PdfTextError } from './pdf-text';
import { getCachedExtraction, saveExtraction } from './cache';

export type ExtractFailureReason =
  | 'encrypted_pdf'
  | 'parse_failed'
  | 'no_text_extracted'
  | 'schema_validation_failed';

export class PdfExtractError extends Error {
  constructor(
    message: string,
    public readonly reason: ExtractFailureReason,
  ) {
    super(message);
    this.name = 'PdfExtractError';
  }
}

export interface ExtractPdfArgs {
  buffer: Buffer;
  fileName: string;
  mime: string;
  offerId?: number;
}

const CHUNK_CHAR_BUDGET = 12_000;
const EXTRACT_MAX_TOKENS = 16_000;
const CHUNK_CONCURRENCY = 3;
const MIN_ITEMS_PER_CHUNK = 1;

export async function extractPdf(args: ExtractPdfArgs): Promise<ExtractedOfferWithMeta> {
  const fileHash = sha256(args.buffer);
  const log = logger.child({
    offerId: args.offerId,
    fileName: args.fileName,
    fileHash: fileHash.slice(0, 12),
  });

  log.info(
    { fileHash: fileHash.slice(0, 12), bufferKb: (args.buffer.length / 1024).toFixed(1) },
    '[extract] checking cache',
  );
  const cached = await getCachedExtraction(fileHash);
  if (cached) {
    log.warn(
      {
        items: cached.payload.items.length,
        model: cached.model,
        firstItem: cached.payload.items[0]?.description?.slice(0, 60),
        lastItem: cached.payload.items[cached.payload.items.length - 1]?.description?.slice(0, 60),
      },
      '[extract] cache HIT — devolviendo payload guardado (no se llama al LLM)',
    );
    return {
      ...cached.payload,
      meta: { strategy: 'text', model: cached.model, fromCache: true },
    };
  }
  log.info('[extract] cache MISS — parseando PDF con unpdf');

  let text: string;
  let pageTexts: string[];
  let pages: number;
  try {
    const result = await extractPdfText(args.buffer);
    text = result.text;
    pageTexts = result.pageTexts;
    pages = result.pages;
    log.info({ pages, textChars: text.length }, '[extract] pdf-parse ok');
  } catch (err) {
    if (err instanceof PdfTextError) {
      const reason: ExtractFailureReason =
        err.reason === 'encrypted'
          ? 'encrypted_pdf'
          : err.reason === 'too_short'
            ? 'no_text_extracted'
            : 'parse_failed';
      log.error({ reason, err: err.message }, '[extract] pdf-parse failed');
      throw new PdfExtractError(err.message, reason);
    }
    throw err;
  }

  const chunks = chunkPagesByCharBudget(pageTexts, CHUNK_CHAR_BUDGET);
  const model = env.EXTRACT_MODEL;
  log.info(
    {
      model,
      maxTokens: EXTRACT_MAX_TOKENS,
      budget: CHUNK_CHAR_BUDGET,
      chunks: chunks.length,
      chunkSizes: chunks.map((c) => c.text.length),
      chunkPages: chunks.map((c) => `p${c.firstPage}-p${c.lastPage}`),
      totalChars: text.length,
    },
    chunks.length === 1 ? '[extract] single-call mode' : '[extract] chunked mode',
  );

  if (args.offerId !== undefined) {
    await prisma.offer.update({
      where: { id: args.offerId },
      data: { extractChunksTotal: chunks.length },
    });
  }

  const limit = pLimit(CHUNK_CONCURRENCY);
  const chunkResults = await Promise.all(
    chunks.map((chunk, idx) =>
      limit(async () => {
        const chunkLog = log.child({ chunk: idx + 1, totalChunks: chunks.length });
        chunkLog.info(
          {
            chars: chunk.text.length,
            pageRange: `${chunk.firstPage}-${chunk.lastPage}`,
          },
          '[extract] calling LLM for chunk',
        );
        try {
          const result = await callChat({
            kind: 'EXTRACT_ITEMS',
            ...(args.offerId !== undefined && { offerId: args.offerId }),
            model,
            systemPrompt: EXTRACT_SYSTEM_PROMPT,
            userPrompt: buildExtractUserPrompt(chunk.text),
            outputSchema: ExtractedOffer,
            maxTokens: EXTRACT_MAX_TOKENS,
            candidatesConsidered: {
              strategy: 'text',
              chunkIdx: idx,
              chunkChars: chunk.text.length,
              pageRange: [chunk.firstPage, chunk.lastPage],
            },
          });
          const firstFew = result.data.items.slice(0, 3).map((it) => it.description.slice(0, 50));
          const lastFew = result.data.items.slice(-3).map((it) => it.description.slice(0, 50));
          const completionRatio = result.completionTokens / EXTRACT_MAX_TOKENS;
          chunkLog.info(
            {
              items: result.data.items.length,
              promptTokens: result.promptTokens,
              completionTokens: result.completionTokens,
              costUsd: Number(result.costUsd.toFixed(6)),
              durationMs: result.durationMs,
              completionRatio: `${result.completionTokens}/${EXTRACT_MAX_TOKENS}`,
              firstItems: firstFew,
              lastItems: lastFew,
              supplier: result.data.header.supplierName,
            },
            '[extract] chunk done',
          );

          if (completionRatio > 0.9) {
            chunkLog.warn(
              {
                completionTokens: result.completionTokens,
                maxTokens: EXTRACT_MAX_TOKENS,
                completionRatio: completionRatio.toFixed(2),
              },
              '[extract] CHUNK CERCA DEL LIMITE — bajar CHUNK_CHAR_BUDGET o subir chunks',
            );
          }
          if (result.data.items.length < MIN_ITEMS_PER_CHUNK && chunk.text.length > 1000) {
            chunkLog.error(
              { items: result.data.items.length, chunkChars: chunk.text.length },
              '[extract] CHUNK SIN ITEMS — texto presente pero extracción vacía',
            );
            throw new PdfExtractError(
              `Chunk ${idx + 1} sin items extraídos pese a ${chunk.text.length} chars`,
              'schema_validation_failed',
            );
          }
          await bumpExtractDone(args.offerId);
          return result;
        } catch (err) {
          chunkLog.error({ err: (err as Error).message }, '[extract] chunk LLM/schema failed');
          await bumpExtractDone(args.offerId);
          throw new PdfExtractError(
            `Validación de schema falló (chunk ${idx + 1}): ${(err as Error).message}`,
            'schema_validation_failed',
          );
        }
      }),
    ),
  );

  const merged = mergeChunks(chunkResults.map((r) => r.data));
  log.info(
    {
      totalItems: merged.items.length,
      perChunk: chunkResults.map((r) => r.data.items.length),
      totalPromptTokens: chunkResults.reduce((acc, r) => acc + r.promptTokens, 0),
      totalCompletionTokens: chunkResults.reduce((acc, r) => acc + r.completionTokens, 0),
      totalCostUsd: chunkResults.reduce((acc, r) => acc + r.costUsd, 0),
    },
    '[extract] all chunks merged',
  );

  const normalized = normalizeOffer(merged);

  log.info('[extract] saving cache');
  await saveExtraction({
    fileHash,
    fileName: args.fileName,
    mime: args.mime,
    model,
    payload: normalized,
  });

  return {
    ...normalized,
    meta: { strategy: 'text', model, fromCache: false },
  };
}

interface PageChunk {
  text: string;
  firstPage: number;
  lastPage: number;
}

async function bumpExtractDone(offerId: number | undefined): Promise<void> {
  if (offerId === undefined) return;
  try {
    await prisma.offer.update({
      where: { id: offerId },
      data: { extractChunksDone: { increment: 1 } },
    });
  } catch (err) {
    logger.warn(
      { offerId, err: (err as Error).message },
      '[extract] failed to bump extractChunksDone',
    );
  }
}

function chunkPagesByCharBudget(pageTexts: ReadonlyArray<string>, budget: number): PageChunk[] {
  const chunks: PageChunk[] = [];
  let current: string[] = [];
  let currentChars = 0;
  let firstPage = 1;

  for (let i = 0; i < pageTexts.length; i++) {
    const page = pageTexts[i] ?? '';
    const pageChars = page.length;

    if (currentChars + pageChars > budget && current.length > 0) {
      chunks.push({
        text: current.join('\n'),
        firstPage,
        lastPage: i,
      });
      current = [];
      currentChars = 0;
      firstPage = i + 1;
    }

    current.push(page);
    currentChars += pageChars;
  }

  if (current.length > 0) {
    chunks.push({
      text: current.join('\n'),
      firstPage,
      lastPage: pageTexts.length,
    });
  }

  if (chunks.length === 0) {
    return [{ text: pageTexts.join('\n'), firstPage: 1, lastPage: pageTexts.length }];
  }

  return chunks;
}

function mergeChunks(chunks: ReadonlyArray<ExtractedOffer>): ExtractedOffer {
  const first = chunks[0];
  if (!first) {
    throw new PdfExtractError('No chunks to merge', 'schema_validation_failed');
  }

  const allItems: ExtractedItem[] = [];
  let lineCounter = 0;

  for (const chunk of chunks) {
    for (const item of chunk.items) {
      lineCounter += 1;
      allItems.push({ ...item, lineNumber: lineCounter });
    }
  }

  const supplierName = chunks.find((c) => c.header.supplierName)?.header.supplierName ?? null;
  const offerDate = chunks.find((c) => c.header.offerDate)?.header.offerDate ?? null;
  const observations = chunks
    .map((c) => c.header.observations)
    .filter((o): o is string => !!o)
    .join('\n')
    .trim();

  return {
    header: {
      supplierName,
      offerDate,
      observations: observations || null,
    },
    items: allItems,
  };
}
