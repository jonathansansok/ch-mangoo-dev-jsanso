import 'server-only';
import pdfParse from 'pdf-parse';

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
}

export async function extractPdfText(buffer: Buffer): Promise<PdfTextResult> {
  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const reason = /encrypt|password/i.test(msg) ? 'encrypted' : 'parse_failed';
    throw new PdfTextError(`pdf-parse falló: ${msg}`, reason);
  }

  const text = parsed.text.trim();
  if (text.length < MIN_TEXT_THRESHOLD) {
    throw new PdfTextError(
      `Texto extraído insuficiente (${text.length} chars < ${MIN_TEXT_THRESHOLD})`,
      'too_short',
    );
  }

  return { text, pages: parsed.numpages };
}
