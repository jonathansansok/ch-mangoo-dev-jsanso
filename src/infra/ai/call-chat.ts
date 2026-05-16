import 'server-only';
import pRetry from 'p-retry';
import type { DecisionKind } from '@prisma/client';
import type { z, ZodTypeAny } from 'zod';
import { prisma } from '@/infra/db/prisma';
import { estimateCost } from '@/lib/openai-pricing';
import { logger } from '@/lib/logger';
import { openaiClient } from './openai-client';
import { truncatePrompt } from './truncate';

const MAX_SCHEMA_RETRIES = 2;

export interface ChatCallArgs<TSchema extends ZodTypeAny> {
  kind: DecisionKind;
  offerId?: number;
  reconciliationLineId?: number;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  outputSchema: TSchema;
  candidatesConsidered?: unknown;
}

export interface ChatCallResult<T> {
  data: T;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

interface CallOnceResult<T> {
  parsed: T;
  rawContent: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

async function callOpenAIOnce<T>(
  args: ChatCallArgs<ZodTypeAny>,
  feedback: string | null,
  outputSchema: z.ZodType<T>,
): Promise<CallOnceResult<T>> {
  const client = openaiClient();
  const start = Date.now();
  const messages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: args.systemPrompt },
    { role: 'user', content: feedback ? `${args.userPrompt}\n\n${feedback}` : args.userPrompt },
  ];

  const response = await client.chat.completions.create({
    model: args.model,
    messages,
    response_format: { type: 'json_object' },
  });

  const rawContent = response.choices[0]?.message?.content ?? '';
  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch (err) {
    throw new SchemaError(`JSON inválido: ${(err as Error).message}`, rawContent);
  }

  const validated = outputSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new SchemaError(
      `Schema inválido: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      rawContent,
    );
  }

  return {
    parsed: validated.data as T,
    rawContent,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    durationMs: Date.now() - start,
  };
}

export class SchemaError extends Error {
  constructor(
    message: string,
    public readonly rawContent: string,
  ) {
    super(message);
    this.name = 'SchemaError';
  }
}

async function persistLog(
  args: ChatCallArgs<ZodTypeAny>,
  payload: {
    promptTokens: number;
    completionTokens: number;
    rawContent: string;
    fullPrompt: string;
    durationMs: number;
    costUsd: number;
  },
): Promise<void> {
  await prisma.decisionLog.create({
    data: {
      offerId: args.offerId ?? null,
      reconciliationLineId: args.reconciliationLineId ?? null,
      kind: args.kind,
      model: args.model,
      promptTokens: payload.promptTokens,
      completionTokens: payload.completionTokens,
      costUsd: payload.costUsd,
      prompt: truncatePrompt(payload.fullPrompt),
      rawResponse: truncatePrompt(payload.rawContent),
      ...(args.candidatesConsidered !== undefined && {
        candidatesConsidered: args.candidatesConsidered as object,
      }),
      durationMs: payload.durationMs,
    },
  });
}

export async function callChat<TSchema extends ZodTypeAny>(
  args: ChatCallArgs<TSchema>,
): Promise<ChatCallResult<z.infer<TSchema>>> {
  type ResultType = z.infer<TSchema>;
  let lastError: SchemaError | null = null;

  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    const feedback = lastError
      ? `La respuesta anterior rompió el schema. Error: ${lastError.message}. Devolvé JSON válido.`
      : null;

    try {
      const result = await pRetry(
        () =>
          callOpenAIOnce<ResultType>(args, feedback, args.outputSchema as z.ZodType<ResultType>),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 8000,
          onFailedAttempt: ({ error, attemptNumber }) => {
            if (error instanceof SchemaError) throw error;
            logger.warn({ attempt: attemptNumber, err: error.message }, 'openai transient retry');
          },
        },
      );

      const costUsd = estimateCost(args.model, {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
      });

      await persistLog(args, {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        rawContent: result.rawContent,
        fullPrompt: `${args.systemPrompt}\n\n${args.userPrompt}`,
        durationMs: result.durationMs,
        costUsd,
      });

      return {
        data: result.parsed,
        costUsd,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        durationMs: result.durationMs,
      };
    } catch (err) {
      if (err instanceof SchemaError) {
        lastError = err;
        logger.warn({ attempt, err: err.message }, 'schema retry');
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Schema validation failed without recoverable error');
}
