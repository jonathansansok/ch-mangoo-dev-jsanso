// Headless: procesa una oferta (PDF/XLSX) end-to-end y escribe los 4 entregables
// (oferta procesada, tabla conciliada, resumen Markdown, trazabilidad) a
// `output/<slug>/`. Útil para correr sin levantar la UI.
//
// Uso:
//   pnpm tsx scripts/process-offer.ts <path> [--request <externalId>]
//
// Ejemplo:
//   pnpm tsx scripts/process-offer.ts fixtures/scenarios/case-simple/offers/oferta_papelera_norte.pdf

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { prisma } from '@/infra/db/prisma';
import { sha256 } from '@/lib/hash';
import { slugify } from '@/lib/slugify';
import { processOfferPipeline } from '@/infra/offer/pipeline';
import { loadReconciliationViewByOffer } from '@/core/output/load-view';
import { buildMarkdownSummary } from '@/core/output/markdown-builder';
import { buildTraceabilityCsv } from '@/core/output/traceability-csv';
import { listAllDecisionLogs } from '@/core/queries/traceability-list';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

interface Args {
  filePath: string;
  requestExternalId: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  let requestExternalId: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--request' || arg === '-r') {
      const next = argv[i + 1];
      if (!next) throw new Error('--request necesita un valor (externalId del PurchaseRequest)');
      requestExternalId = next;
      i++;
    } else if (arg.startsWith('--')) {
      throw new Error(`Flag desconocida: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(
      'Esperaba 1 path de archivo. Uso: process-offer <path> [--request <externalId>]',
    );
  }
  return { filePath: positional[0]!, requestExternalId };
}

async function resolveRequestId(
  filePath: string,
  override: string | null,
): Promise<{ id: number; externalId: string }> {
  if (override) {
    const req = await prisma.purchaseRequest.findUnique({ where: { externalId: override } });
    if (!req)
      throw new Error(`PurchaseRequest "${override}" no existe. Corré pnpm db:seed primero.`);
    return { id: req.id, externalId: req.externalId };
  }
  const lower = filePath.toLowerCase();
  const wantedExternalId = lower.includes('case-complex')
    ? 'REQ-MOP-2026-001'
    : lower.includes('case-simple')
      ? 'REQ-OFI-2026-001'
      : null;
  if (wantedExternalId) {
    const req = await prisma.purchaseRequest.findUnique({
      where: { externalId: wantedExternalId },
    });
    if (req) return { id: req.id, externalId: req.externalId };
  }
  const first = await prisma.purchaseRequest.findFirst({ orderBy: { id: 'asc' } });
  if (!first) throw new Error('No hay PurchaseRequests en DB. Corré pnpm db:seed primero.');
  return { id: first.id, externalId: first.externalId };
}

async function ensureOffer(args: {
  buffer: Buffer;
  hash: string;
  fileName: string;
  mime: string;
  requestId: number;
}): Promise<number> {
  const existing = await prisma.offer.findUnique({ where: { sourceFileHash: args.hash } });
  if (existing && existing.status !== 'FAILED') return existing.id;
  if (existing) {
    await prisma.offer.update({
      where: { id: existing.id },
      data: { status: 'PENDING', failureReason: null },
    });
    return existing.id;
  }
  const created = await prisma.offer.create({
    data: {
      requestId: args.requestId,
      sourceFile: args.fileName,
      sourceFileHash: args.hash,
      sourceFileMime: args.mime,
      status: 'PENDING',
    },
  });
  return created.id;
}

interface ProcessedOffer {
  supplier: string | null;
  offerDate: Date | null;
  sourceFile: string;
  observations: string | null;
  items: Array<{
    lineNumber: number;
    supplierCode: string | null;
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    currency: string | null;
    rawObservations: string | null;
  }>;
}

async function loadProcessedOffer(offerId: number): Promise<ProcessedOffer> {
  const offer = await prisma.offer.findUniqueOrThrow({
    where: { id: offerId },
    include: { items: { orderBy: { lineNumber: 'asc' } } },
  });
  return {
    supplier: offer.supplierName,
    offerDate: offer.offerDate,
    sourceFile: offer.sourceFile,
    observations: offer.observations,
    items: offer.items.map((it) => ({
      lineNumber: it.lineNumber,
      supplierCode: it.supplierCode,
      description: it.description,
      quantity: it.quantity !== null ? Number(it.quantity) : null,
      unit: it.unit,
      unitPrice: it.unitPrice !== null ? Number(it.unitPrice) : null,
      currency: it.currency,
      rawObservations: it.rawObservations,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const filePath = resolve(args.filePath);
  if (!existsSync(filePath)) throw new Error(`Archivo no existe: ${filePath}`);

  const fileName = basename(filePath);
  const ext = extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Extensión no soportada: ${ext}. Aceptadas: .pdf, .xlsx, .xls`);

  const buffer = await readFile(filePath);
  const hash = sha256(buffer);

  const { id: requestId, externalId } = await resolveRequestId(filePath, args.requestExternalId);
  console.error(`→ Solicitud destino: ${externalId} (id=${requestId})`);
  console.error(
    `→ Archivo: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB, hash=${hash.slice(0, 12)})`,
  );

  const offerId = await ensureOffer({ buffer, hash, fileName, mime, requestId });
  console.error(`→ Offer id=${offerId}, corriendo pipeline...`);

  const start = Date.now();
  await processOfferPipeline({ offerId, buffer, fileName, mime });
  console.error(`→ Pipeline terminó en ${((Date.now() - start) / 1000).toFixed(1)}s`);

  const finalOffer = await prisma.offer.findUniqueOrThrow({
    where: { id: offerId },
    select: { status: true, failureReason: true, supplierName: true },
  });
  if (finalOffer.status === 'FAILED') {
    throw new Error(`Pipeline falló: ${finalOffer.failureReason ?? 'desconocido'}`);
  }

  const view = await loadReconciliationViewByOffer(offerId);
  if (!view) throw new Error('No hay vista de conciliación. Algo se rompió silenciosamente.');

  const traceRows = await listAllDecisionLogs({ offerId });

  const outDir = resolve(
    'output',
    `${slugify(finalOffer.supplierName ?? fileName)}-${hash.slice(0, 8)}`,
  );
  await mkdir(outDir, { recursive: true });

  const processed = await loadProcessedOffer(offerId);
  const ofertaJson = JSON.stringify(processed, null, 2);
  const summaryMd = buildMarkdownSummary(view);
  const tablaMd = extractMatchedTable(summaryMd);
  const traceCsv = buildTraceabilityCsv(traceRows);

  await Promise.all([
    writeFile(resolve(outDir, 'oferta.json'), ofertaJson, 'utf8'),
    writeFile(resolve(outDir, 'summary.md'), summaryMd, 'utf8'),
    writeFile(resolve(outDir, 'tabla.md'), tablaMd, 'utf8'),
    writeFile(resolve(outDir, 'trace.csv'), traceCsv, 'utf8'),
  ]);

  console.error(`✔ Outputs en: ${outDir}`);
  console.error(
    `  - oferta.json       (cabecera + ${processed.items.length} items)\n` +
      `  - tabla.md          (tabla conciliada)\n` +
      `  - summary.md        (resumen Markdown para el comprador)\n` +
      `  - trace.csv         (${traceRows.length} decisiones del LLM)`,
  );
}

function extractMatchedTable(summary: string): string {
  const sections = summary.split(/\n## /);
  const matched = sections.find((s) => s.startsWith('Items conciliados'));
  const missing = sections.find((s) => s.startsWith('Items faltantes'));
  const extra = sections.find((s) => s.startsWith('Items sobrantes en la oferta'));
  return ['## ' + (matched ?? ''), '## ' + (missing ?? ''), '## ' + (extra ?? '')]
    .filter((s) => s !== '## undefined' && s !== '## ')
    .join('\n\n');
}

main()
  .catch((err) => {
    console.error('✖', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
