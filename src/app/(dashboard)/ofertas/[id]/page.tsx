import { ArrowLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/infra/db/prisma';
import { OfferDetail } from './OfferDetail';
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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OfertaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const offer = await loadOffer(numericId);
  if (!offer) notFound();

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
        <div className="flex items-end gap-2.5">
          <Package className="h-8 w-8 shrink-0 text-[#2f458a]" />
          <h1 className="text-[28px] leading-tight font-bold text-[#2f458a]">{offer.sourceFile}</h1>
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

      <OfferDetail offer={offer} />
    </div>
  );
}
