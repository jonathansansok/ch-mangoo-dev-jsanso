import 'server-only';
import { extractPdf, PdfExtractError } from '@/infra/extract/pdf-service';
import { logger } from '@/lib/logger';
import { persistExtractedOffer } from './persist-extracted';
import { setOfferStatus } from './status';

export type PipelineFailureReason =
  | 'encrypted_pdf'
  | 'parse_failed'
  | 'no_text_extracted'
  | 'schema_validation_failed'
  | 'persist_failed'
  | 'unsupported_mime'
  | 'unknown';

export interface PipelineArgs {
  offerId: number;
  buffer: Buffer;
  fileName: string;
  mime: string;
}

export async function processOfferPipeline(args: PipelineArgs): Promise<void> {
  try {
    if (args.mime !== 'application/pdf') {
      await setOfferStatus(args.offerId, 'FAILED', 'unsupported_mime');
      return;
    }

    await setOfferStatus(args.offerId, 'EXTRACTING');
    const extracted = await extractPdf({
      buffer: args.buffer,
      fileName: args.fileName,
      mime: args.mime,
      offerId: args.offerId,
    });

    try {
      await persistExtractedOffer(args.offerId, extracted);
    } catch (err) {
      logger.error({ offerId: args.offerId, err }, 'persist failed');
      await setOfferStatus(args.offerId, 'FAILED', 'persist_failed');
      return;
    }

    await setOfferStatus(args.offerId, 'EXTRACTED');
  } catch (err) {
    const reason: PipelineFailureReason = err instanceof PdfExtractError ? err.reason : 'unknown';
    logger.error({ offerId: args.offerId, reason, err }, 'pipeline failed');
    await setOfferStatus(args.offerId, 'FAILED', reason);
  }
}
