import { createHash } from 'node:crypto';

export function sha256(buffer: Buffer | string): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}
