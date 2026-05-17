'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/infra/db/prisma';
import { loadReconciliationView } from '@/core/output/load-view';
import { buildMarkdownSummary } from '@/core/output/markdown-builder';

export async function regenerateSummary(reconciliationId: number): Promise<{ ok: boolean }> {
  const view = await loadReconciliationView(reconciliationId);
  if (!view) return { ok: false };
  const summary = buildMarkdownSummary(view);
  await prisma.reconciliation.update({
    where: { id: reconciliationId },
    data: { summary },
  });
  revalidatePath(`/ofertas/${view.offerId}`);
  return { ok: true };
}
