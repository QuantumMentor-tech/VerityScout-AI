import { describe, it, expect } from 'vitest';
import { IdentityMatcher } from '@/server/changes/identity-matcher';
import { CandidateWithEvidence } from '@/server/changes/change-detection.types';
import { CandidateResultRow, MatchClassification } from '@/server/persistence/types';

describe('IdentityMatcher', () => {
  const matcher = new IdentityMatcher();

  const mockCandidateWithEvidence = (
    overrides: Partial<CandidateResultRow>
  ): CandidateWithEvidence => ({
    candidate: {
      id: 'cand-1',
      run_id: 'run-1',
      user_id: 'user-1',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      product_identifier: null,
      seller_or_domain: 'amazon.com',
      canonical_url: 'https://www.amazon.com/dp/B09XS7JWHH',
      price_usd: '398.00',
      currency: 'USD',
      availability: 'IN_STOCK',
      condition: 'NEW',
      specifications: { weight: '250 g', batteryLife: '30 hours' },
      classification: MatchClassification.EXACT_MATCH,
      constraint_evaluation: { passedConstraints: [], failedConstraints: [] },
      created_at: '2026-11-06T08:00:00.000Z',
      ...overrides,
    },
    evidence: [],
  });

  it('matches candidates by stable product identifier (SKU / MPN)', () => {
    const baseline = [
      mockCandidateWithEvidence({
        id: 'base-1',
        title: 'Sony Headphones WH1000XM5 Black',
        product_identifier: 'WH1000XM5-BLK',
        canonical_url: 'https://store.sony.com/product-1',
      }),
    ];

    const current = [
      mockCandidateWithEvidence({
        id: 'curr-1',
        title: 'Sony Noise Canceling WH-1000XM5 - Black Edition',
        product_identifier: 'wh1000xm5-blk', // case-insensitive
        canonical_url: 'https://bestbuy.com/p/9999',
      }),
    ];

    const pairs = matcher.matchCandidates(baseline, current);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.matchType).toBe('STABLE_IDENTIFIER');
    expect(pairs[0]?.baseline?.candidate.id).toBe('base-1');
    expect(pairs[0]?.current?.candidate.id).toBe('curr-1');
  });

  it('matches candidates by normalized canonical URL when identifiers are missing', () => {
    const baseline = [
      mockCandidateWithEvidence({
        id: 'base-url',
        product_identifier: null,
        canonical_url: 'https://www.amazon.com/dp/B09XS7JWHH?ref=sr_1_1&tag=affil',
      }),
    ];

    const current = [
      mockCandidateWithEvidence({
        id: 'curr-url',
        product_identifier: null,
        canonical_url: 'https://amazon.com/dp/B09XS7JWHH/',
      }),
    ];

    const pairs = matcher.matchCandidates(baseline, current);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.matchType).toBe('CANONICAL_URL');
    expect(pairs[0]?.baseline?.candidate.id).toBe('base-url');
    expect(pairs[0]?.current?.candidate.id).toBe('curr-url');
  });

  it('matches candidates by clean title when URLs and identifiers differ', () => {
    const baseline = [
      mockCandidateWithEvidence({
        id: 'base-title',
        product_identifier: null,
        canonical_url: 'https://retailer-a.com/sony-xm5',
        title: 'Sony WH-1000XM5 Wireless Headphones (Black)!',
      }),
    ];

    const current = [
      mockCandidateWithEvidence({
        id: 'curr-title',
        product_identifier: null,
        canonical_url: 'https://retailer-b.com/sony-xm5',
        title: 'Sony WH-1000XM5 Wireless Headphones Black',
      }),
    ];

    const pairs = matcher.matchCandidates(baseline, current);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.matchType).toBe('CLEAN_TITLE');
  });

  it('separates product variants (NEW vs REFURBISHED) and refuses to collapse them', () => {
    const baseline = [
      mockCandidateWithEvidence({
        id: 'base-new',
        product_identifier: 'WH1000XM5',
        condition: 'NEW',
      }),
    ];

    const current = [
      mockCandidateWithEvidence({
        id: 'curr-refurb',
        product_identifier: 'WH1000XM5',
        condition: 'REFURBISHED',
      }),
    ];

    const pairs = matcher.matchCandidates(baseline, current);

    // Because condition differs, they must NOT be merged as the same candidate!
    // One should be NO_LONGER_OBSERVED (the NEW one) and one NEWLY_OBSERVED (the REFURBISHED one)
    expect(pairs).toHaveLength(2);

    const noLonger = pairs.find((p) => p.matchType === 'NO_LONGER_OBSERVED');
    const newlyObs = pairs.find((p) => p.matchType === 'NEWLY_OBSERVED');

    expect(noLonger).toBeDefined();
    expect(noLonger?.baseline?.candidate.id).toBe('base-new');
    expect(newlyObs).toBeDefined();
    expect(newlyObs?.current?.candidate.id).toBe('curr-refurb');
  });

  it('correctly labels newly discovered candidates in the current run', () => {
    const baseline: CandidateWithEvidence[] = [];
    const current = [
      mockCandidateWithEvidence({
        id: 'curr-brand-new',
        title: 'Bose QuietComfort Ultra',
      }),
    ];

    const pairs = matcher.matchCandidates(baseline, current);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.matchType).toBe('NEWLY_OBSERVED');
    expect(pairs[0]?.baseline).toBeNull();
    expect(pairs[0]?.current?.candidate.id).toBe('curr-brand-new');
  });

  it('correctly labels unobserved baseline candidates as NO_LONGER_OBSERVED', () => {
    const baseline = [
      mockCandidateWithEvidence({
        id: 'base-dropped',
        title: 'Discontinued Sennheiser Momentum 3',
      }),
    ];
    const current: CandidateWithEvidence[] = [];

    const pairs = matcher.matchCandidates(baseline, current);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.matchType).toBe('NO_LONGER_OBSERVED');
    expect(pairs[0]?.baseline?.candidate.id).toBe('base-dropped');
    expect(pairs[0]?.current).toBeNull();
  });
});

