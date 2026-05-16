import 'server-only';
import pRetry from 'p-retry';
import type { DecisionKind } from '@prisma/client';
import { prisma } from '@/infra/db/prisma';
import { estimateCost } from '@/lib/openai-pricing';
import { logger } from '@/lib/logger';
import { openaiClient } from './openai-client';

export interface EmbedCallArgs {
  kind: Extract<DecisionKind, 'EMBED_REQUEST' | 'EMBED_OFFER'>;
  offerId?: number;
  model: string;
  inputs: readonly string[];
}

export interface EmbedCallResult {
  vectors: number[][];
  costUsd: number;
  promptTokens: number;
  durationMs: number;
}

export async function callEmbed(args: EmbedCallArgs): Promise<EmbedCallResult> {
  const client = openaiClient();
  const start = Date.now();

  const response = await pRetry(
    () => client.embeddings.create({ model: args.model, input: args.inputs as string[] }),
    {
      retries: 3,
      minTimeout: 1000,
      maxTimeout: 8000,
      onFailedAttempt: ({ error, attemptNumber }) => {
        logger.warn({ attempt: attemptNumber, err: error.message }, 'embed retry');
      },
    },
  );

  const durationMs = Date.now() - start;
  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const costUsd = estimateCost(args.model, { prompt_tokens: promptTokens, completion_tokens: 0 });
  const vectors = response.data.map((d) => d.embedding);

  await prisma.decisionLog.create({
    data: {
      offerId: args.offerId ?? null,
      kind: args.kind,
      model: args.model,
      promptTokens,
      completionTokens: 0,
      costUsd,
      prompt: `embed ${args.inputs.length} inputs`,
      rawResponse: `${vectors.length} vectors of dim ${vectors[0]?.length ?? 0}`,
      durationMs,
    },
  });

  return { vectors, costUsd, promptTokens, durationMs };
}
