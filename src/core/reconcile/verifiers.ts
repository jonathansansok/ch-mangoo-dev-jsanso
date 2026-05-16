import { unitsCompatible } from '@/lib/normalize-text';

export interface VerifierConfig {
  minSimilarity: number;
  qtyRatioMin: number;
  qtyRatioMax: number;
}

export type VerifierFlag =
  | 'below_similarity_threshold'
  | 'quantity_anomaly'
  | 'unit_mismatch'
  | 'excess';

export interface VerifierInput {
  similarity: number | null;
  quantityOffered: number | null;
  quantityRequested: number | null;
  unitOffered: string | null;
  unitRequested: string | null;
}

export interface VerifierOutput {
  flags: VerifierFlag[];
  shouldDowngradeToLowConfidence: boolean;
}

export function runVerifiers(input: VerifierInput, config: VerifierConfig): VerifierOutput {
  const flags: VerifierFlag[] = [];
  let downgrade = false;

  if (input.similarity !== null && input.similarity < config.minSimilarity) {
    flags.push('below_similarity_threshold');
    downgrade = true;
  }

  if (
    input.quantityOffered !== null &&
    input.quantityRequested !== null &&
    input.quantityRequested > 0
  ) {
    const ratio = input.quantityOffered / input.quantityRequested;
    if (ratio < config.qtyRatioMin || ratio > config.qtyRatioMax) {
      flags.push('quantity_anomaly');
    }
    if (ratio > 1) {
      flags.push('excess');
    }
  }

  if (!unitsCompatible(input.unitOffered, input.unitRequested)) {
    flags.push('unit_mismatch');
  }

  return { flags, shouldDowngradeToLowConfidence: downgrade };
}
