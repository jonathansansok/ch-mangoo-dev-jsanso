import 'server-only';
import { callEmbed } from '@/infra/ai/call-embed';
import { embedText } from '@/lib/normalize-text';
import { logger } from '@/lib/logger';
import { env } from '@/env';

export interface EmbeddableItem {
  id: number;
  description: string;
  unit: string | null;
}

export interface ItemEmbedding {
  id: number;
  vector: number[];
}

interface EmbedResult {
  embeddings: ItemEmbedding[];
  promptTokens: number;
  costUsd: number;
  durationMs: number;
}

async function embedBatch(
  items: readonly EmbeddableItem[],
  kind: 'EMBED_REQUEST' | 'EMBED_OFFER',
  offerId?: number,
): Promise<EmbedResult> {
  if (items.length === 0) {
    return { embeddings: [], promptTokens: 0, costUsd: 0, durationMs: 0 };
  }
  const inputs = items.map((it) => embedText(it.description, it.unit));
  const result = await callEmbed({
    kind,
    ...(offerId !== undefined && { offerId }),
    model: env.EMBED_MODEL,
    inputs,
  });
  logger.info(
    { kind, count: items.length, costUsd: result.costUsd, durationMs: result.durationMs },
    '[reconcile] embed done',
  );
  return {
    embeddings: items.map((it, idx) => ({ id: it.id, vector: result.vectors[idx] ?? [] })),
    promptTokens: result.promptTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  };
}

export async function embedRequestItems(
  items: readonly EmbeddableItem[],
  offerId?: number,
): Promise<EmbedResult> {
  return embedBatch(items, 'EMBED_REQUEST', offerId);
}

export async function embedOfferItems(
  items: readonly EmbeddableItem[],
  offerId?: number,
): Promise<EmbedResult> {
  return embedBatch(items, 'EMBED_OFFER', offerId);
}
