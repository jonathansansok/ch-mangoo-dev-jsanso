import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const BOM = /^﻿/;

export function readCsvRows(path: string): Record<string, string>[] {
  const raw = readFileSync(path, 'utf8').replace(BOM, '');
  return parse(raw, {
    columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}
