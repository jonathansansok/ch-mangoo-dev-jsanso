import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.test'));

if (!process.env['DATABASE_URL_TEST'] && process.env['DATABASE_URL']) {
  const url = process.env['DATABASE_URL'];
  if (url.endsWith('_test') || url.includes('/oferta_test')) {
    process.env['DATABASE_URL_TEST'] = url;
  }
}
if (process.env['DATABASE_URL_TEST']) {
  process.env['DATABASE_URL'] = process.env['DATABASE_URL_TEST'];
}
process.env['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'] ?? 'sk-test-mock-no-real-calls';
(process.env as Record<string, string>)['NODE_ENV'] = 'test';
