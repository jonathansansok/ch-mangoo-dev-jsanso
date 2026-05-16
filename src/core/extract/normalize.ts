import type { ExtractedItem, ExtractedOffer } from './schema';

function trimOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeItem(item: ExtractedItem): ExtractedItem {
  return {
    ...item,
    description: item.description.trim(),
    supplierCode: trimOrNull(item.supplierCode),
    unit: trimOrNull(item.unit),
    currency: item.currency ? item.currency.toUpperCase().trim() : null,
    rawObservations: trimOrNull(item.rawObservations),
  };
}

export function normalizeOffer(offer: ExtractedOffer): ExtractedOffer {
  return {
    header: {
      supplierName: trimOrNull(offer.header.supplierName),
      offerDate: offer.header.offerDate,
      observations: trimOrNull(offer.header.observations),
    },
    items: offer.items.map(normalizeItem),
  };
}
