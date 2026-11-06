import { describe, it, expect } from 'vitest';
import { AttributeComparator } from '@/server/changes/attribute-comparator';
import { CandidateMatchPair, ComparisonScope } from '@/server/changes/change-detection.types';
import {
  CandidateResultRow,
  EvidenceRecordRow,
  MatchClassification,
  ChangeType,
  ChangeStatus,
  VerificationState,
} from '@/server/persistence/types';

describe('AttributeComparator', () => {
  const comparator = new AttributeComparator();

  const mockScope: ComparisonScope = {
    taskId: 'task-1',
    scheduleId: 'sched-1',
    userId: 'user-1',
    baselineRunId: 'run-base',
    currentRunId: 'run-curr',
  };

  const createCandidate = (overrides: Partial<CandidateResultRow>): CandidateResultRow => ({
    id: 'cand-1',
    run_id: 'run-1',
    user_id: 'user-1',
    title: 'Framework Laptop 13 AMD 7040 Series',
    product_identifier: 'FW-LAPTOP-13-AMD',
    seller_or_domain: 'frame.work',
    canonical_url: 'https://frame.work/products/laptop-13-gen-amd',
    price_usd: '1049.00',
    currency: 'USD',
    availability: 'IN_STOCK',
    condition: 'NEW',
    specifications: { weight: '1.3 kg', memory: '16 GB', storage: '512 GB' },
    classification: MatchClassification.EXACT_MATCH,
    constraint_evaluation: { passedConstraints: [], failedConstraints: [] },
    created_at: '2026-11-06T08:00:00.000Z',
    ...overrides,
  });

  const createEvidence = (overrides: Partial<EvidenceRecordRow>): EvidenceRecordRow => ({
    id: 'ev-1',
    run_id: 'run-1',
    source_id: 'src-1',
    user_id: 'user-1',
    candidate_id: 'cand-1',
    claim_key: 'price',
    extracted_raw_value: '$1,049.00',
    normalized_value: '1049.00',
    unit_or_currency: 'USD',
    verbatim_quote: 'Starting at $1,049.00 with AMD Ryzen 5',
    verification_state: VerificationState.SUPPORTED,
    conflict_details: null,
    extraction_method: 'DOM_SELECTOR',
    location_in_document: '#price-tag',
    confidence_score: '0.99',
    extracted_at: '2026-11-06T08:00:00.000Z',
    ...overrides,
  });

  it('evaluates normalized units as UNCHANGED (e.g. 1.4 kg vs 1400 g) without firing false changes', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({
          specifications: { weight: '1.4 kg' },
        }),
        evidence: [createEvidence({ id: 'base-ev-weight', claim_key: 'weight' })],
      },
      current: {
        candidate: createCandidate({
          specifications: { weight: '1400 g' },
        }),
        evidence: [createEvidence({ id: 'curr-ev-weight', claim_key: 'weight' })],
      },
    };

    // By default, changes list excludes UNCHANGED
    const defaultChanges = comparator.comparePair(pair, mockScope, { includeUnchanged: false });
    const weightChanges = defaultChanges.filter((c) => c.fieldName === 'spec:weight');
    expect(weightChanges).toHaveLength(0);

    // With includeUnchanged enabled, returns UNCHANGED with VALUE_EQUIVALENT_AFTER_NORMALIZATION
    const allChanges = comparator.comparePair(pair, mockScope, { includeUnchanged: true });
    const weightChange = allChanges.find((c) => c.fieldName === 'spec:weight');
    expect(weightChange).toBeDefined();
    expect(weightChange?.changeType).toBe(ChangeType.UNCHANGED);
    expect(weightChange?.reasonCode).toBe('VALUE_EQUIVALENT_AFTER_NORMALIZATION');
    expect(weightChange?.isSupported).toBe(true);
  });

  it('marks currency mismatch ($999 vs €999) as NOT_COMPARABLE without converting', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({
          price_usd: '999.00',
          currency: 'USD',
        }),
        evidence: [createEvidence({ id: 'base-ev-price' })],
      },
      current: {
        candidate: createCandidate({
          price_usd: '999.00',
          currency: 'EUR',
        }),
        evidence: [createEvidence({ id: 'curr-ev-price' })],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const priceChange = changes.find((c) => c.fieldName === 'price');

    expect(priceChange).toBeDefined();
    expect(priceChange?.changeType).toBe(ChangeType.NOT_COMPARABLE);
    expect(priceChange?.changeStatus).toBe(ChangeStatus.NOT_COMPARABLE);
    expect(priceChange?.reasonCode).toBe('CURRENCY_NOT_COMPARABLE');
    expect(priceChange?.isSupported).toBe(false);
    expect(priceChange?.baselineEvidenceId).toBe('base-ev-price');
    expect(priceChange?.evidenceId).toBe('curr-ev-price');
  });

  it('detects confirmed PRICE_DROP with exact percentage delta and dual evidence links', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({
          price_usd: '1000.00',
          currency: 'USD',
        }),
        evidence: [createEvidence({ id: 'base-ev-1000' })],
      },
      current: {
        candidate: createCandidate({
          price_usd: '800.00',
          currency: 'USD',
        }),
        evidence: [createEvidence({ id: 'curr-ev-800' })],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const priceChange = changes.find((c) => c.fieldName === 'price');

    expect(priceChange).toBeDefined();
    expect(priceChange?.changeType).toBe(ChangeType.PRICE_DROP);
    expect(priceChange?.changeStatus).toBe(ChangeStatus.SUPPORTED);
    expect(priceChange?.reasonCode).toBe('PRICE_DROP_CONFIRMED');
    expect(priceChange?.percentageDelta).toBe(-20);
    expect(priceChange?.previousValue).toBe('1000.00 USD');
    expect(priceChange?.newValue).toBe('800.00 USD');
    expect(priceChange?.baselineEvidenceId).toBe('base-ev-1000');
    expect(priceChange?.evidenceId).toBe('curr-ev-800');
  });

  it('detects confirmed PRICE_INCREASE with positive percentage delta', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({
          price_usd: '1000.00',
          currency: 'USD',
        }),
        evidence: [createEvidence({ id: 'base-ev-1000' })],
      },
      current: {
        candidate: createCandidate({
          price_usd: '1200.00',
          currency: 'USD',
        }),
        evidence: [createEvidence({ id: 'curr-ev-1200' })],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const priceChange = changes.find((c) => c.fieldName === 'price');

    expect(priceChange).toBeDefined();
    expect(priceChange?.changeType).toBe(ChangeType.PRICE_INCREASE);
    expect(priceChange?.percentageDelta).toBe(20);
    expect(priceChange?.reasonCode).toBe('PRICE_INCREASE_CONFIRMED');
  });

  it('detects STOCK_STATUS_CHANGE when availability status changes', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({ availability: 'IN_STOCK' }),
        evidence: [createEvidence({ claim_key: 'availability' })],
      },
      current: {
        candidate: createCandidate({ availability: 'OUT_OF_STOCK' }),
        evidence: [createEvidence({ claim_key: 'availability' })],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const stockChange = changes.find((c) => c.fieldName === 'availability');

    expect(stockChange).toBeDefined();
    expect(stockChange?.changeType).toBe(ChangeType.STOCK_STATUS_CHANGE);
    expect(stockChange?.reasonCode).toBe('STOCK_STATUS_CHANGED');
    expect(stockChange?.previousValue).toBe('IN_STOCK');
    expect(stockChange?.newValue).toBe('OUT_OF_STOCK');
  });

  it('treats missing specification as NO_LONGER_OBSERVED without asserting real-world deletion', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({
          specifications: { bluetooth: '5.3', memory: '16 GB' },
        }),
        evidence: [],
      },
      current: {
        candidate: createCandidate({
          specifications: { memory: '16 GB' }, // bluetooth omitted in current run extraction
        }),
        evidence: [],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const btChange = changes.find((c) => c.fieldName === 'spec:bluetooth');

    expect(btChange).toBeDefined();
    expect(btChange?.changeType).toBe(ChangeType.NO_LONGER_OBSERVED);
    expect(btChange?.reasonCode).toBe('ATTRIBUTE_NO_LONGER_OBSERVED');
    expect(btChange?.newValue).toBe('NO_LONGER_OBSERVED');
  });

  it('treats newly extracted specification as ADDED', () => {
    const pair: CandidateMatchPair = {
      matchType: 'STABLE_IDENTIFIER',
      matchKey: 'FW-LAPTOP-13-AMD',
      baseline: {
        candidate: createCandidate({ specifications: { memory: '16 GB' } }),
        evidence: [],
      },
      current: {
        candidate: createCandidate({
          specifications: { memory: '16 GB', display: '13.5 inch 2.8K OLED' },
        }),
        evidence: [],
      },
    };

    const changes = comparator.comparePair(pair, mockScope);
    const dispChange = changes.find((c) => c.fieldName === 'spec:display');

    expect(dispChange).toBeDefined();
    expect(dispChange?.changeType).toBe(ChangeType.ADDED);
    expect(dispChange?.reasonCode).toBe('ATTRIBUTE_FIRST_OBSERVED');
    expect(dispChange?.newValue).toBe('13.5 inch 2.8K OLED');
  });
});

