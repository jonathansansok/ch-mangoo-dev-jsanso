import 'server-only';
import { extractPdf, PdfExtractError } from '@/infra/extract/pdf-service';
import { extractXlsx, XlsxExtractError } from '@/infra/extract/xlsx-service';
import { reconcileOffer, ReconcileError } from '@/infra/reconcile/reconcile-service';
import { logger } from '@/lib/logger';
import type { ExtractedOfferWithMeta } from '@/core/extract/schema';
import { persistExtractedOffer } from './persist-extracted';
import { setOfferStatus } from './status';

export type PipelineFailureReason =
  | 'encrypted_pdf'
  | 'parse_failed'
  | 'no_text_extracted'
  | 'schema_validation_failed'
  | 'persist_failed'
  | 'unsupported_mime'
  | 'no_offer_items'
  | 'request_has_no_items'
  | 'reconcile_failed'
  | 'corrupt_xlsx'
  | 'password_protected'
  | 'no_structured_data'
  | 'unknown';

const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function detectKind(mime: string, fileName: string): 'pdf' | 'xlsx' | 'unsupported' {
  if (mime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (XLSX_MIMES.has(mime)) return 'xlsx';
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  return 'unsupported';
}

export interface PipelineArgs {
  offerId: number;
  buffer: Buffer;
  fileName: string;
  mime: string;
}

export async function processOfferPipeline(args: PipelineArgs): Promise<void> {
  const start = Date.now();
  const log = logger.child({ offerId: args.offerId, fileName: args.fileName });
  log.info({ mime: args.mime, sizeKb: (args.buffer.length / 1024).toFixed(1) }, '[pipeline] start');

  try {
    const kind = detectKind(args.mime, args.fileName);
    if (kind === 'unsupported') {
      log.warn(
        { mime: args.mime, fileName: args.fileName },
        '[pipeline] unsupported file, aborting',
      );
      await setOfferStatus(args.offerId, 'FAILED', 'unsupported_mime');
      return;
    }

    log.info({ kind }, '[pipeline] → EXTRACTING');
    await setOfferStatus(args.offerId, 'EXTRACTING');

    const extractStart = Date.now();
    let extracted: ExtractedOfferWithMeta;
    try {
      extracted =
        kind === 'pdf'
          ? await extractPdf({
              buffer: args.buffer,
              fileName: args.fileName,
              mime: args.mime,
              offerId: args.offerId,
            })
          : await extractXlsx({
              buffer: args.buffer,
              fileName: args.fileName,
              mime: args.mime,
              offerId: args.offerId,
            });
    } catch (err) {
      const reason: PipelineFailureReason =
        err instanceof PdfExtractError
          ? err.reason
          : err instanceof XlsxExtractError
            ? err.reason
            : 'unknown';
      log.error({ reason, err: (err as Error).message }, '[pipeline] extract failed');
      await setOfferStatus(args.offerId, 'FAILED', reason);
      return;
    }
    log.info(
      {
        durationMs: Date.now() - extractStart,
        items: extracted.items.length,
        fromCache: extracted.meta.fromCache,
        strategy: extracted.meta.strategy,
        model: extracted.meta.model,
        supplier: extracted.header.supplierName,
      },
      '[pipeline] extract done',
    );

    try {
      log.info({ items: extracted.items.length }, '[pipeline] persisting items');
      await persistExtractedOffer(args.offerId, extracted);
      log.info('[pipeline] persist done');
    } catch (err) {
      log.error({ err }, '[pipeline] persist failed');
      await setOfferStatus(args.offerId, 'FAILED', 'persist_failed');
      return;
    }

    log.info({ extractMs: Date.now() - start }, '[pipeline] → EXTRACTED');
    await setOfferStatus(args.offerId, 'EXTRACTED');

    try {
      log.info('[pipeline] → RECONCILING');
      const reconcileStart = Date.now();
      await reconcileOffer(args.offerId);
      log.info({ reconcileMs: Date.now() - reconcileStart }, '[pipeline] reconcile done');
    } catch (err) {
      const reason: PipelineFailureReason =
        err instanceof ReconcileError
          ? ((err.reason as PipelineFailureReason) ?? 'reconcile_failed')
          : 'reconcile_failed';
      log.error({ reason, err }, '[pipeline] reconcile failed');
      await setOfferStatus(args.offerId, 'FAILED', reason);
      return;
    }

    log.info({ totalMs: Date.now() - start }, '[pipeline] → RECONCILED (done)');
  } catch (err) {
    const reason: PipelineFailureReason = err instanceof PdfExtractError ? err.reason : 'unknown';
    log.error({ reason, err }, '[pipeline] failed');
    await setOfferStatus(args.offerId, 'FAILED', reason);
  }
}
