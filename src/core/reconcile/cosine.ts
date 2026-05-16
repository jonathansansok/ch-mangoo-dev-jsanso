export function dot(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return sum;
}

export function magnitude(vec: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum);
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  const denom = magnitude(a) * magnitude(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}
