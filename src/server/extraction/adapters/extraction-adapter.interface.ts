import 'server-only';
import type {
  ExtractionProviderId,
  ExtractionRequest,
  ExtractedDocument,
} from '../contracts';

/**
 * VerityScout AI — Extraction Provider Adapter Contract (`IExtractionProvider`)
 * Governed by: ADR-005, DEC-006, and Step 34.
 *
 * Implemented by:
 * - DirectSafeFetchExtractor (Tier 1: Free In-House HTTP Fetch + Local JSDOM Parser)
 * - FirecrawlExtractionAdapter (Tier 2: Managed Cloud Extraction for SPAs / Bot Challenges)
 * - MockExtractionAdapter (Deterministic offline test double)
 */
export interface IExtractionProvider {
  readonly providerId: ExtractionProviderId;
  extract(request: ExtractionRequest, apiKey?: string): Promise<ExtractedDocument>;
}

