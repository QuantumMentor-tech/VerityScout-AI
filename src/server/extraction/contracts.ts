import 'server-only';
import { z } from 'zod';
import type { NormalizedSearchResult } from '@/server/search';

/**
 * VerityScout AI — Source Extraction & Content Normalization Contracts
 * Governed by: Step 34 (Source Extraction Adapter, Safe Content Retrieval, and Extracted-Content Normalization)
 *
 * Traceability:
 * - Requirements: UR-006, NFR-005, NFR-007, NFR-009, NFR-010
 * - Acceptance Criteria: AC-006 (Multi-Source Page Extraction & Normalization)
 * - ADRs: ADR-005 (Pluggable Search & Two-Tier Extraction), DEC-006
 */

export const EXTRACTION_PROVIDER_IDS = [
  'direct_safe_fetch',
  'firecrawl',
  'mock_extract',
] as const;
export type ExtractionProviderId = (typeof EXTRACTION_PROVIDER_IDS)[number];

export function isExtractionProviderId(val: unknown): val is ExtractionProviderId {
  return typeof val === 'string' && (EXTRACTION_PROVIDER_IDS as readonly string[]).includes(val);
}

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
  UNSUPPORTED_CONTENT = 'UNSUPPORTED_CONTENT',
  SKIPPED = 'SKIPPED',
}

/**
 * Input request for extracting a single validated web source.
 */
export const ExtractionRequestSchema = z.object({
  url: z.string().url(),
  maxBodyBytes: z.number().int().min(1024).max(10 * 1024 * 1024).default(5 * 1024 * 1024),
  timeoutMs: z.number().int().min(1000).max(30000).default(15000),
  requireJsRendering: z.boolean().default(false),
  requestId: z.string().min(1),
});
export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema> & {
  readonly searchCandidate?: NormalizedSearchResult | undefined;
  readonly signal?: AbortSignal | undefined;
};

/**
 * Normalized representation of an extracted web document.
 * Raw HTML is strictly sanitized/stripped to prevent XSS and prompt injection.
 */
export interface ExtractedDocument {
  readonly id: string;
  readonly provider: ExtractionProviderId;
  readonly requestedUrl: string;
  readonly finalUrl: string;
  readonly domain: string;
  readonly title: string | null;
  readonly markdownContent: string;
  readonly textExcerpt: string | null;
  readonly contentHash: string | null;
  readonly author: string | null;
  readonly publisher: string | null;
  readonly publishedDate: string | null;
  readonly language: string | null;
  readonly contentType: string | null;
  readonly httpStatusCode: number;
  readonly accessState: SourceAccessState;
  readonly extractionState: ExtractionState;
  readonly warnings: readonly string[];
  readonly retrievedAt: string;
  readonly usage: {
    readonly bytesReceived: number;
    readonly latencyMs: number;
  };
}

export type ExtractionErrorCode =
  | 'INVALID_URL'
  | 'SSRF_PROHIBITED'
  | 'AUTHENTICATION_REQUIRED'
  | 'BOT_CHALLENGE_BLOCKED'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'PARSING_FAILED'
  | 'CREDENTIAL_MISSING'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

export class ExtractionError extends Error {
  public readonly code: ExtractionErrorCode;
  public readonly providerId?: ExtractionProviderId | undefined;
  public readonly statusCode?: number | undefined;

  constructor(
    code: ExtractionErrorCode,
    message: string,
    options?: {
      readonly providerId?: ExtractionProviderId | undefined;
      readonly statusCode?: number | undefined;
      readonly cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'ExtractionError';
    this.code = code;
    this.providerId = options?.providerId;
    this.statusCode = options?.statusCode;
  }
}

/**
 * Options for configuring bounded batch extraction in SourceExtractionService.
 */
export interface ExtractionOptions {
  readonly providerId?: ExtractionProviderId | undefined;
  readonly maxUrls?: number | undefined;
  readonly concurrency?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBodyBytes?: number | undefined;
  readonly allowTier2Fallback?: boolean | undefined;
  readonly explicitApiKey?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * Summary of a batch extraction operation across multiple source URLs.
 */
export interface ExtractionBatchSummary {
  readonly totalRequested: number;
  readonly totalSuccessful: number;
  readonly totalFailed: number;
  readonly documents: readonly ExtractedDocument[];
  readonly durationMs: number;
}

