import { ArrowLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/infra/db/prisma';
import { loadReconciliationViewByOffer } from '@/core/output/load-view';
import { buildMarkdownSummary } from '@/core/output/markdown-builder';
import { OfferDetail } from './OfferDetail';
import { OfferTabs, type OfferTabKey } from './tabs/OfferTabs';
import { OfferItemsTab } from './tabs/OfferItemsTab';
import { ConciliacionTab } from './tabs/ConciliacionTab';
import { ResumenTab } from './tabs/ResumenTab';
import { TrazabilidadTab } from './tabs/TrazabilidadTab';
import type { OfferView } from './types';

export const dynamic = 'force-dynamic';

async function loadOffer(id: number): Promise<OfferView | null> {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      request: { select: { externalId: true, title: true } },
      items: { orderBy: { lineNumber: 'asc' } },
      reconciliation: {
        include: {
          lines: {
            orderBy: [{ relation: 'asc' }, { id: 'asc' }],
            include: {
              offerItem: { select: { lineNumber: true, description: true, supplierCode: true } },
              requestItem: { select: { externalItemId: true, description: true, unit: true } },
            },
          },
        },
      },
    },
  });
  if (!offer) return null;

  return {
    id: offer.id,
    status: offer.status,
    failureReason: offer.failureReason,
    supplierName: offer.supplierName,
    offerDate: offer.offerDate,
    observations: offer.observations,
    sourceFile: offer.sourceFile,
    requestId: offer.requestId,
    updatedAt: offer.updatedAt,
    request: offer.request,
    items: offer.items.map((i) => ({
      id: i.id,
      lineNumber: i.lineNumber,
      supplierCode: i.supplierCode,
      description: i.description,
      quantity: i.quantity?.toString() ?? null,
      unitPrice: i.unitPrice?.toString() ?? null,
      currency: i.currency,
      unit: i.unit,
    })),
    reconciliation: offer.reconciliation
      ? {
          id: offer.reconciliation.id,
          itemsCovered: offer.reconciliation.itemsCovered,
          itemsMissing: offer.reconciliation.itemsMissing,
          itemsExtra: offer.reconciliation.itemsExtra,
          itemsPartial: offer.reconciliation.itemsPartial,
          itemsLowConfidence: offer.reconciliation.itemsLowConfidence,
          totalCostUsd: offer.reconciliation.totalCostUsd.toString(),
          completedAt: offer.reconciliation.completedAt,
          lines: offer.reconciliation.lines.map((l) => ({
            id: l.id,
            relation: l.relation,
            confidence: l.confidence.toString(),
            embeddingSimilarity: l.embeddingSimilarity?.toString() ?? null,
            quantityRequested: l.quantityRequested?.toString() ?? null,
            quantityOffered: l.quantityOffered?.toString() ?? null,
            rationale: l.rationale,
            flags: extractFlags(l.flags),
            offerItem: l.offerItem
              ? {
                  lineNumber: l.offerItem.lineNumber,
                  description: l.offerItem.description,
                  supplierCode: l.offerItem.supplierCode,
                }
              : null,
            requestItem: l.requestItem
              ? {
                  externalItemId: l.requestItem.externalItemId,
                  description: l.requestItem.description,
                  unit: l.requestItem.unit,
                }
              : null,
          })),
        }
      : null,
  };
}

function extractFlags(flags: unknown): string[] {
  if (!flags || typeof flags !== 'object') return [];
  const f = flags as { flags?: unknown };
  return Array.isArray(f.flags) ? (f.flags as string[]) : [];
}

async function loadSummary(offerId: number, reconciliationId: number): Promise<string | null> {
  const rec = await prisma.reconciliation.findUnique({
    where: { id: reconciliationId },
    select: { summary: true },
  });
  if (rec?.summary) return rec.summary;
  const view = await loadReconciliationViewByOffer(offerId);
  if (!view) return null;
  const md = buildMarkdownSummary(view);
  await prisma.reconciliation.update({
    where: { id: reconciliationId },
    data: { summary: md },
  });
  return md;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OfertaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const offer = await loadOffer(numericId);
  if (!offer) notFound();

  const summary = offer.reconciliation
    ? await loadSummary(offer.id, offer.reconciliation.id)
    : null;

  const panels: Record<OfferTabKey, React.ReactNode> = {
    oferta: <OfferItemsTab items={offer.items} status={offer.status} />,
    conciliacion: <ConciliacionTab reconciliation={offer.reconciliation} />,
    resumen:
      offer.reconciliation && summary ? (
        <ResumenTab
          offerId={offer.id}
          reconciliationId={offer.reconciliation.id}
          summary={summary}
        />
      ) : (
        <EmptyPanel message="El resumen estará disponible cuando la conciliación termine." />
      ),
    trazabilidad: <TrazabilidadTab offerId={offer.id} />,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/ofertas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-[#65758b] hover:text-[#2f458a]"
        >
          <ArrowLeft className="h-4 w-4" />
          Ofertas
        </Link>
        <div className="flex items-center gap-2.5">
          <Package className="h-7 w-7 shrink-0 text-[#2f458a] md:h-8 md:w-8" />
          <h1 className="text-2xl leading-tight font-bold break-all text-[#2f458a] md:text-[28px]">
            {offer.sourceFile}
          </h1>
        </div>
        <p className="text-sm text-[#65758b]">
          Solicitud{' '}
          <Link
            href={`/solicitudes/${offer.requestId}` as never}
            className="font-mono font-semibold text-[#2f458a] hover:underline"
          >
            {offer.request.externalId}
          </Link>{' '}
          — {offer.request.title}
        </p>
      </div>

      <OfferDetail offer={offer}>
        <OfferTabs panels={panels} />
      </OfferDetail>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-tl-none rounded-tr-3xl rounded-br-none rounded-bl-3xl border border-[#d1d5db] bg-white p-6">
      <p className="text-sm text-[#6a7282]">{message}</p>
    </div>
  );
}
