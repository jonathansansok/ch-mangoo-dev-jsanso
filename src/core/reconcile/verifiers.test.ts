import { describe, expect, it } from 'vitest';
import { runVerifiers } from './verifiers';

const config = { minSimilarity: 0.65, qtyRatioMin: 0.1, qtyRatioMax: 3.0 };

describe('runVerifiers', () => {
  it('flags below_similarity_threshold and downgrades', () => {
    const result = runVerifiers(
      {
        similarity: 0.5,
        quantityOffered: 100,
        quantityRequested: 100,
        unitOffered: 'm',
        unitRequested: 'metro',
      },
      config,
    );
    expect(result.flags).toContain('below_similarity_threshold');
    expect(result.shouldDowngradeToLowConfidence).toBe(true);
  });

  it('does not downgrade for similarity above threshold', () => {
    const result = runVerifiers(
      {
        similarity: 0.8,
        quantityOffered: 100,
        quantityRequested: 100,
        unitOffered: 'm',
        unitRequested: 'metro',
      },
      config,
    );
    expect(result.shouldDowngradeToLowConfidence).toBe(false);
  });

  it('flags quantity_anomaly for very low ratio', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: 5,
        quantityRequested: 100,
        unitOffered: null,
        unitRequested: null,
      },
      config,
    );
    expect(result.flags).toContain('quantity_anomaly');
  });

  it('flags quantity_anomaly and excess for very high ratio', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: 400,
        quantityRequested: 100,
        unitOffered: null,
        unitRequested: null,
      },
      config,
    );
    expect(result.flags).toContain('quantity_anomaly');
    expect(result.flags).toContain('excess');
  });

  it('flags excess only when offer > request but within range', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: 150,
        quantityRequested: 100,
        unitOffered: null,
        unitRequested: null,
      },
      config,
    );
    expect(result.flags).toContain('excess');
    expect(result.flags).not.toContain('quantity_anomaly');
  });

  it('flags unit_mismatch on incompatible units', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: 100,
        quantityRequested: 100,
        unitOffered: 'kilogramo',
        unitRequested: 'metro',
      },
      config,
    );
    expect(result.flags).toContain('unit_mismatch');
  });

  it('does not flag when units are synonymous', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: 100,
        quantityRequested: 100,
        unitOffered: 'm',
        unitRequested: 'metro',
      },
      config,
    );
    expect(result.flags).not.toContain('unit_mismatch');
  });

  it('handles null quantities', () => {
    const result = runVerifiers(
      {
        similarity: 0.9,
        quantityOffered: null,
        quantityRequested: 100,
        unitOffered: null,
        unitRequested: null,
      },
      config,
    );
    expect(result.flags).not.toContain('quantity_anomaly');
  });
});
