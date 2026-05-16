import 'server-only';
import * as XLSX from 'xlsx';

export class XlsxTextError extends Error {
  constructor(
    message: string,
    public readonly reason: 'corrupt_xlsx' | 'password_protected' | 'no_sheets',
  ) {
    super(message);
    this.name = 'XlsxTextError';
  }
}

export interface XlsxSheet {
  name: string;
  rows: Array<Array<unknown>>;
}

const MAX_SHEETS = 3;

export function readXlsx(buffer: Buffer): XlsxSheet[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      throw new XlsxTextError(msg, 'password_protected');
    }
    throw new XlsxTextError(msg || 'No se pudo leer el XLSX', 'corrupt_xlsx');
  }

  if (!wb.SheetNames.length) {
    throw new XlsxTextError('XLSX sin hojas', 'no_sheets');
  }

  const sheetNames = wb.SheetNames.slice(0, MAX_SHEETS);
  return sheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    if (!sheet) return { name, rows: [] };
    const rows = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    });
    return { name, rows };
  });
}
