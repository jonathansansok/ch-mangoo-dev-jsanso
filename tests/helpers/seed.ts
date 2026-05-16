import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { PrismaClient } from '@prisma/client';

const BOM = /^﻿/;

interface CsvRow {
  [key: string]: string;
}

function readCsv(path: string): CsvRow[] {
  const raw = readFileSync(path, 'utf8').replace(BOM, '');
  return parse(raw, {
    columns: (headers: string[]) => headers.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

export interface SeededScenario {
  requestId: number;
  externalId: string;
  itemCount: number;
}

export async function seedScenario(
  prisma: PrismaClient,
  scenario: 'case-simple' | 'case-complex',
): Promise<SeededScenario> {
  const dir = join('fixtures', 'scenarios', scenario);
  const requests = readCsv(join(dir, 'purchase_requests.csv'));
  const items = readCsv(join(dir, 'purchase_request_items.csv'));

  const first = requests[0];
  if (!first) throw new Error(`No requests in ${scenario}`);

  const created = await prisma.purchaseRequest.create({
    data: {
      externalId: first['request_id']!,
      title: first['title']!,
    },
  });

  const data = items
    .filter((row) => row['request_id'] === first['request_id'])
    .map((row) => ({
      requestId: created.id,
      externalItemId: Number(row['item_id']),
      description: row['description']!,
      quantity: row['quantity']!,
      unit: row['unit']!,
    }));

  await prisma.purchaseRequestItem.createMany({ data });

  return { requestId: created.id, externalId: created.externalId, itemCount: data.length };
}

export async function createOfferRow(
  prisma: PrismaClient,
  requestId: number,
  file: { name: string; mime: string; hash: string },
): Promise<number> {
  const offer = await prisma.offer.create({
    data: {
      requestId,
      sourceFile: file.name,
      sourceFileMime: file.mime,
      sourceFileHash: file.hash,
      status: 'PENDING',
    },
  });
  return offer.id;
}
