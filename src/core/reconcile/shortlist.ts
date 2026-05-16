import { cosine } from './cosine';

export interface Candidate {
  id: number;
  similarity: number;
}

export interface VectorEntry {
  id: number;
  vector: readonly number[];
}

export function shortlistFor(
  queryVector: readonly number[],
  pool: readonly VectorEntry[],
  k: number,
): Candidate[] {
  const scored: Candidate[] = pool.map((entry) => ({
    id: entry.id,
    similarity: cosine(queryVector, entry.vector),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
