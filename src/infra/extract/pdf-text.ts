import 'server-only';
import { extractText, getDocumentProxy } from 'unpdf';
import { logger } from '@/lib/logger';

export const MIN_TEXT_THRESHOLD = 200;

export class PdfTextError extends Error {
  constructor(
    message: string,
    public readonly reason: 'encrypted' | 'parse_failed' | 'too_short',
  ) {
    super(message);
    this.name = 'PdfTextError';
  }
}

export interface PdfTextResult {
  text: string;
  pages: number;
  pageTexts: string[];
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  const magic = buffer.subarray(0, 5).toString('latin1');
  const tail = buffer.subarray(buffer.length - 6, buffer.length - 1).toString('latin1');
  logger.info({ bufferLength: buffer.length, magic, tail }, '[pdf-text] buffer diagnostic');
  if (!magic.startsWith('%PDF-')) {
    throw new PdfTextError(
      `Buffer no es PDF válido (magic="${magic}", length=${buffer.length})`,
      'parse_failed',
    );
  }

  let pageTexts: string[];
  let pages: number;
  try {
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const doc = await getDocumentProxy(uint8);
    pages = doc.numPages;
    const extracted = await extractText(doc, { mergePages: false });
    pageTexts = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const reason = /encrypt|password/i.test(msg) ? 'encrypted' : 'parse_failed';
    throw new PdfTextError(`unpdf falló: ${msg}`, reason);
  }

  const text = pageTexts.join('\n').trim();
  if (text.length < MIN_TEXT_THRESHOLD) {
    throw new PdfTextError(
      `Texto extraído insuficiente (${text.length} chars < ${MIN_TEXT_THRESHOLD})`,
      'too_short',
    );
  }

  logger.info(
    {
      pages,
      totalChars: text.length,
      pageChars: pageTexts.map((p) => p.length),
    },
    '[pdf-text] parsed',
  );

  return { text, pages, pageTexts };
}
