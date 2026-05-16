import 'server-only';
import { callChat } from '@/infra/ai/call-chat';
import { sha256 } from '@/lib/hash';
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
  const cached = await getCachedExtraction(fileHash);
  if (cached) {
    return {
      ...cached.payload,
      meta: { strategy: 'text', model: cached.model, fromCache: true },
    };
  }

  const text = await runPdfParseOrFail(args.buffer);

  const model = env.EXTRACT_MODEL;
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
    throw new PdfExtractError(
      `Validación de schema falló: ${(err as Error).message}`,
      'schema_validation_failed',
    );
  }

  const normalized = normalizeOffer(result.data);

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

async function runPdfParseOrFail(buffer: Buffer): Promise<string> {
  try {
    const { text } = await extractPdfText(buffer);
    return text;
  } catch (err) {
    if (err instanceof PdfTextError) {
      const reason: ExtractFailureReason =
        err.reason === 'encrypted'
          ? 'encrypted_pdf'
          : err.reason === 'too_short'
            ? 'no_text_extracted'
            : 'parse_failed';
      throw new PdfExtractError(err.message, reason);
    }
    throw err;
  }
}
