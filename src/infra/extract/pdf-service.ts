import 'server-only';
import { callChat } from '@/infra/ai/call-chat';
import { sha256 } from '@/lib/hash';
import { logger } from '@/lib/logger';
import { env } from '@/env';
import { normalizeOffer } from '@/core/extract/normalize';
import { buildExtractUserPrompt, EXTRACT_SYSTEM_PROMPT } from '@/core/extract/prompts';
import { ExtractedOffer, type ExtractedOfferWithMeta } from '@/core/extract/schema';
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

export async function extractPdf(args: ExtractPdfArgs): Promise<ExtractedOfferWithMeta> {
  const fileHash = sha256(args.buffer);
  const log = logger.child({
    offerId: args.offerId,
    fileName: args.fileName,
    fileHash: fileHash.slice(0, 12),
  });

  log.info('[extract] checking cache');
  const cached = await getCachedExtraction(fileHash);
  if (cached) {
    log.info({ items: cached.payload.items.length, model: cached.model }, '[extract] cache HIT');
    return {
      ...cached.payload,
      meta: { strategy: 'text', model: cached.model, fromCache: true },
    };
  }
  log.info('[extract] cache MISS, parsing pdf');

  let text: string;
  try {
    const result = await extractPdfText(args.buffer);
    text = result.text;
    log.info({ pages: result.pages, textChars: text.length }, '[extract] pdf-parse ok');
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

  const model = env.EXTRACT_MODEL;
  log.info({ model, textChars: text.length }, '[extract] calling LLM');

  let result;
  try {
    result = await callChat({
      kind: 'EXTRACT_ITEMS',
      ...(args.offerId !== undefined && { offerId: args.offerId }),
      model,
      systemPrompt: EXTRACT_SYSTEM_PROMPT,
      userPrompt: buildExtractUserPrompt(text),
      outputSchema: ExtractedOffer,
      candidatesConsidered: { strategy: 'text', textLength: text.length },
    });
  } catch (err) {
    log.error({ err: (err as Error).message }, '[extract] LLM/schema failed');
    throw new PdfExtractError(
      `Validación de schema falló: ${(err as Error).message}`,
      'schema_validation_failed',
    );
  }

  log.info(
    {
      items: result.data.items.length,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    },
    '[extract] LLM done',
  );

  const normalized = normalizeOffer(result.data);

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
