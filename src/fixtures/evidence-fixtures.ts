import {
  type SourceDocument,
  type EvidenceRecord,
  SourceAccessState,
  ExtractionState,
  VerificationState,
} from '@/features/evidence/types';

export const SAMPLE_SOURCES_FIXTURE: readonly SourceDocument[] = [
  {
    id: 'src-001',
    runId: 'demo-run-001',
    originalUrl: 'https://example.com/listings/thinkpad-t14-gen3-32gb',
    canonicalUrl: 'https://example.com/listings/thinkpad-t14-gen3-32gb',
    domain: 'ebay.com',
    title: 'eBay Refurbished — Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 7 PRO 6850U, 32GB LPDDR5, 512GB SSD)',
    discoveryProvider: 'tavily',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
    httpStatusCode: 200,
    extractedTextExcerpt:
      'Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 7 PRO 6850U 8-Core, 32GB LPDDR5-6400 RAM, 512GB PCIe SSD). Condition: Certified Refurbished - Grade A. Buy It Now: $649.99 with free standard shipping.',
    retrievedAt: '2026-10-30T14:20:45Z',
    publishedAt: '2026-10-30T10:00:00Z',
  },
  {
    id: 'src-002',
    runId: 'demo-run-001',
    originalUrl: 'https://example.com/listings/thinkpad-t14-gen3-16gb',
    canonicalUrl: 'https://example.com/listings/thinkpad-t14-gen3-16gb',
    domain: 'amazon.com',
    title: 'Amazon Renewed — Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 5 PRO 6650U, 16GB RAM, 256GB SSD)',
    discoveryProvider: 'exa',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
    httpStatusCode: 200,
    extractedTextExcerpt:
      'Lenovo ThinkPad T14 Gen 3 Laptop, 14" FHD+, AMD Ryzen 5 PRO 6650U, 16GB RAM, 256GB SSD. Price: $529.00. Condition: Refurbished - Excellent.',
    retrievedAt: '2026-10-30T14:20:55Z',
    publishedAt: '2026-10-29T18:30:00Z',
  },
  {
    id: 'src-003',
    runId: 'demo-run-001',
    originalUrl: 'https://example.com/psref/thinkpad-t14-gen3-amd.pdf',
    canonicalUrl: 'https://example.com/psref/thinkpad-t14-gen3-amd.pdf',
    domain: 'lenovo.com',
    title: 'Lenovo PSREF — ThinkPad T14 Gen 3 (AMD) Product Specifications Reference',
    discoveryProvider: 'direct',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
    httpStatusCode: 200,
    extractedTextExcerpt:
      'ThinkPad T14 Gen 3 (AMD) models feature AMD Ryzen 5 PRO 6650U or Ryzen 7 PRO 6850U processors. Memory is soldered LPDDR5-6400 up to 32GB.',
    retrievedAt: '2026-10-30T14:20:30Z',
    publishedAt: '2026-06-15T00:00:00Z',
  },
  {
    id: 'src-004',
    runId: 'demo-run-001',
    originalUrl: 'javascript:void(0)',
    canonicalUrl: 'javascript:void(0)',
    domain: 'untrusted-forum.local',
    title: 'Community Hardware Forum Thread #84192 (Untrusted Protocol Example)',
    discoveryProvider: 'direct',
    accessState: SourceAccessState.BLOCKED_BOT_CHALLENGE,
    extractionState: ExtractionState.SKIPPED,
    extractedTextExcerpt: 'Access denied: bot challenge failed during automated retrieval.',
    retrievedAt: '2026-10-30T14:20:10Z',
  },
] as const;

export const SAMPLE_EVIDENCE_FIXTURE: readonly EvidenceRecord[] = [
  {
    id: 'ev-001',
    runId: 'demo-run-001',
    sourceId: 'src-001',
    candidateId: 'cand-001',
    claimKey: 'Price ($)',
    extractedRawValue: '$649.99',
    normalizedValue: '649.99',
    unitOrCurrency: 'USD',
    verbatimQuote: 'Buy It Now price: $649.99 with free standard shipping.',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'REGEX_DETERMINISTIC',
    extractedAt: '2026-10-30T14:21:00Z',
    locationInDocument: 'Header > Buy Box > Price Container',
  },
  {
    id: 'ev-002',
    runId: 'demo-run-001',
    sourceId: 'src-001',
    candidateId: 'cand-001',
    claimKey: 'Memory (RAM)',
    extractedRawValue: '32GB LPDDR5-6400',
    normalizedValue: 32,
    unitOrCurrency: 'GB',
    verbatimQuote: 'Installed Memory: 32GB LPDDR5-6400MHz soldered.',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'LLM_STRUCTURED',
    extractedAt: '2026-10-30T14:21:05Z',
    locationInDocument: 'Technical Specifications Table > Memory',
  },
  {
    id: 'ev-003',
    runId: 'demo-run-001',
    sourceId: 'src-001',
    candidateId: 'cand-001',
    claimKey: 'Processor',
    extractedRawValue: 'AMD Ryzen 7 PRO 6850U',
    normalizedValue: 'AMD Ryzen 7 PRO 6850U',
    verbatimQuote: 'Processor: AMD Ryzen 7 PRO 6850U (8 cores, 16 threads, up to 4.7GHz Max Boost).',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'LLM_STRUCTURED',
    extractedAt: '2026-10-30T14:21:08Z',
    locationInDocument: 'Technical Specifications Table > CPU',
  },
  {
    id: 'ev-004',
    runId: 'demo-run-001',
    sourceId: 'src-001',
    candidateId: 'cand-001',
    claimKey: 'Condition',
    extractedRawValue: 'Certified Refurbished (Grade A)',
    normalizedValue: 'Certified Refurbished',
    verbatimQuote: 'Condition: Certified Refurbished. Pristine condition (Grade A), tested and inspected by manufacturer approved vendor.',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'LLM_STRUCTURED',
    extractedAt: '2026-10-30T14:21:10Z',
    locationInDocument: 'Item Specifics > Item Condition',
  },
  {
    id: 'ev-005',
    runId: 'demo-run-001',
    sourceId: 'src-002',
    candidateId: 'cand-002',
    claimKey: 'Price ($)',
    extractedRawValue: '$529.00',
    normalizedValue: '529.00',
    unitOrCurrency: 'USD',
    verbatimQuote: 'Price: $529.00 ($120.00 less than new MSRP).',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'REGEX_DETERMINISTIC',
    extractedAt: '2026-10-30T14:21:02Z',
    locationInDocument: 'Product Details > Pricing Box',
  },
  {
    id: 'ev-006',
    runId: 'demo-run-001',
    sourceId: 'src-002',
    candidateId: 'cand-002',
    claimKey: 'Memory (RAM)',
    extractedRawValue: '16GB RAM',
    normalizedValue: 16,
    unitOrCurrency: 'GB',
    verbatimQuote: 'System Memory: 16GB RAM on-board (cannot be upgraded).',
    verificationState: VerificationState.CONTRADICTED,
    conflictDetails: 'Extracted 16GB RAM fails user hard constraint of 32GB minimum.',
    extractionMethod: 'LLM_STRUCTURED',
    extractedAt: '2026-10-30T14:21:07Z',
    locationInDocument: 'Feature Bullet #3',
  },
  {
    id: 'ev-007',
    runId: 'demo-run-001',
    sourceId: 'src-003',
    claimKey: 'Specification Baseline',
    extractedRawValue: 'Max Memory 32GB LPDDR5-6400',
    normalizedValue: 32,
    unitOrCurrency: 'GB',
    verbatimQuote: 'ThinkPad T14 Gen 3 (AMD): Memory: Up to 32GB soldered memory, not upgradable. LPDDR5-6400.',
    verificationState: VerificationState.SUPPORTED,
    extractionMethod: 'META_TAG',
    extractedAt: '2026-10-30T14:21:12Z',
    locationInDocument: 'PSREF Section 2.1 Memory Subsystem',
  },
] as const;

export function getSourcesForRun(runId: string): readonly SourceDocument[] {
  return SAMPLE_SOURCES_FIXTURE.filter((src) => src.runId === runId);
}

export function getSourceById(sourceId: string): SourceDocument | undefined {
  return SAMPLE_SOURCES_FIXTURE.find((src) => src.id === sourceId);
}

export function getEvidenceForCandidate(candidateId: string): readonly EvidenceRecord[] {
  return SAMPLE_EVIDENCE_FIXTURE.filter((ev) => ev.candidateId === candidateId);
}

export function getEvidenceForSource(sourceId: string): readonly EvidenceRecord[] {
  return SAMPLE_EVIDENCE_FIXTURE.filter((ev) => ev.sourceId === sourceId);
}

export function getEvidenceById(evidenceId: string): EvidenceRecord | undefined {
  return SAMPLE_EVIDENCE_FIXTURE.find((ev) => ev.id === evidenceId);
}
