import 'server-only';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY es requerida'),
  MAX_TOKENS_PER_RUN: z.coerce.number().int().positive().default(100_000),
  MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.65),
  JUDGE_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  SHORTLIST_K: z.coerce.number().int().positive().default(5),
  QTY_RATIO_MIN: z.coerce.number().positive().default(0.1),
  QTY_RATIO_MAX: z.coerce.number().positive().default(3.0),
  JUDGE_MODEL: z.string().default('gpt-4o-mini'),
  EXTRACT_MODEL: z.string().default('gpt-4o-mini'),
  EMBED_MODEL: z.string().default('text-embedding-3-small'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const skipValidation = process.env['SKIP_ENV_VALIDATION'] === 'true';

function loadEnv() {
  if (skipValidation) {
    return EnvSchema.parse({
      DATABASE_URL: process.env['DATABASE_URL'] ?? 'mysql://dummy:dummy@localhost:3306/dummy',
      OPENAI_API_KEY: process.env['OPENAI_API_KEY'] ?? 'sk-dummy',
    });
  }
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
