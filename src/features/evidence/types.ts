/**
 * ==============================================================================
 * VerityScout AI — Source Explorer & Evidence Drawer Domain Types
 * ==============================================================================
 * Governed by: Step 20 (Source Explorer & Evidence Drawer)
 * Conforms to: DATA_CONTRACTS.md (Section 2.2, 3.3, 3.4)
 * ==============================================================================
 */

export enum SourceAccessState {
  ACCESSIBLE = 'ACCESSIBLE',
  BLOCKED_BOT_CHALLENGE = 'BLOCKED_BOT_CHALLENGE',
  HTTP_ERROR = 'HTTP_ERROR',
  TIMEOUT = 'TIMEOUT',
  DNS_RESOLUTION_FAILED = 'DNS_RESOLUTION_FAILED',
  SSRF_PROHIBITED = 'SSRF_PROHIBITED',
}

export enum ExtractionState {
  SUCCESS = 'SUCCESS',
  EMPTY_BODY = 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  PARSING_FAILED = 'PARSING_FAILED',
  SKIPPED = 'SKIPPED',
}

export enum VerificationState {
  SUPPORTED = 'SUPPORTED',
  CONTRADICTED = 'CONTRADICTED',
  UNKNOWN = 'UNKNOWN',
  CONFLICTING = 'CONFLICTING',
  STALE = 'STALE',
}

export type ExtractionMethod = 'LLM_STRUCTURED' | 'REGEX_DETERMINISTIC' | 'META_TAG' | 'DOM_SELECTOR';

export interface SourceDocument {
  readonly id: string;
  readonly runId: string;
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly domain: string;
  readonly title: string;
  readonly discoveryProvider: string;
  readonly accessState: SourceAccessState;
  readonly extractionState: ExtractionState;
  readonly httpStatusCode?: number | undefined;
  readonly contentHash?: string | undefined;
  readonly extractedTextExcerpt?: string | undefined;
  readonly retrievedAt: string;
  readonly publishedAt?: string | undefined;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly runId?: string | undefined;
  readonly sourceId: string;
  readonly candidateId?: string | undefined;
  readonly claimKey: string;
  readonly extractedRawValue: string;
  readonly normalizedValue?: string | number | undefined;
  readonly unitOrCurrency?: string | undefined;
  readonly verbatimQuote?: string | undefined;
  readonly verificationState: VerificationState;
  readonly conflictDetails?: string | undefined;
  readonly extractionMethod: ExtractionMethod;
  readonly extractedAt?: string | undefined;
  readonly locationInDocument?: string | undefined;
  readonly confidenceScore?: number | undefined;
  readonly capturedAt?: string | undefined;
}

export interface SourceUrlValidationResult {
  readonly isValid: boolean;
  readonly safeUrl?: string | undefined;
  readonly domain?: string | undefined;
  readonly protocol?: string | undefined;
  readonly error?: string | undefined;
}
