import { PrismaClient } from '@prisma/client';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './seed/args';
import { readCsvRows } from './seed/csv';
import { ItemRow, RequestRow } from './seed/schemas';
import { truncateAll, upsertItem, upsertRequest } from './seed/repository';

const SCENARIOS_DIR = 'fixtures/scenarios';

interface ScenarioStats {
  scenario: string;
  requests: number;
  items: number;
  durationMs: number;
}

function listScenarios(only: string | null): string[] {
  const all = readdirSync(SCENARIOS_DIR).filter((name) =>
    statSync(join(SCENARIOS_DIR, name)).isDirectory(),
  );
  return only ? all.filter((n) => n === only) : all;
}

async function seedScenario(prisma: PrismaClient, scenarioName: string): Promise<ScenarioStats> {
  const start = Date.now();
  const dir = join(SCENARIOS_DIR, scenarioName);

  const requestRows = readCsvRows(join(dir, 'purchase_requests.csv'));
  const itemRows = readCsvRows(join(dir, 'purchase_request_items.csv'));

  const requestIdMap = new Map<string, number>();
  for (const raw of requestRows) {
    const parsed = RequestRow.parse(raw);
    const id = await upsertRequest(prisma, parsed);
    requestIdMap.set(parsed.request_id, id);
  }

  for (const raw of itemRows) {
    const parsed = ItemRow.parse(raw);
    const requestId = requestIdMap.get(parsed.request_id);
    if (!requestId) {
      throw new Error(
        `Item con request_id="${parsed.request_id}" referencia request inexistente en ${scenarioName}`,
      );
    }
    await upsertItem(prisma, requestId, parsed);
  }

  return {
    scenario: scenarioName,
    requests: requestRows.length,
    items: itemRows.length,
    durationMs: Date.now() - start,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    if (args.reset) {
      console.log('[seed] reset: borrando datos previos');
      await truncateAll(prisma);
    }

    const scenarios = listScenarios(args.only);
    if (scenarios.length === 0) {
      console.warn(`[seed] sin escenarios para cargar (only=${args.only ?? 'all'})`);
      return;
    }

    const totalStart = Date.now();
    const stats: ScenarioStats[] = [];
    for (const name of scenarios) {
      const s = await seedScenario(prisma, name);
      stats.push(s);
      console.log(
        `[seed] ${s.scenario}: ${s.requests} requests + ${s.items} items en ${s.durationMs}ms`,
      );
    }
    console.log(`[seed] total: ${Date.now() - totalStart}ms (${stats.length} escenarios)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] error:', err);
  process.exit(1);
});
