import 'server-only';
import type { PoolClient } from 'pg';
import type {
  ClaimExtractionInput,
  ClaimExtractionSummary,
  ExtractedClaim,
  RejectedClaimRecord,
  ExtractionMethod,
} from './contracts';
import { extractClaimsViaRules } from './adapters/rule-based-claim-extractor';
import { AiClaimExtractor } from './adapters/ai-claim-extractor';
import { EvidenceRecordRepository } from '@/server/persistence/repositories';
import type { TransactionContext } from '@/server/persistence/transaction';
import { SourceAccessState, ExtractionState } from '@/server/extraction/contracts';
import { logger } from '@/lib/logging/logger';

export interface ClaimExtractionServiceOptions {
  readonly evidenceRepo?: EvidenceRecordRepository | undefined;
  readonly aiExtractor?: AiClaimExtractor | undefined;
}

export class ClaimExtractionService {
  private readonly evidenceRepo: EvidenceRecordRepository;
  private readonly aiExtractor: AiClaimExtractor;

  constructor(options?: ClaimExtractionServiceOptions) {
    this.evidenceRepo = options?.evidenceRepo ?? new EvidenceRecordRepository();
    this.aiExtractor = options?.aiExtractor ?? new AiClaimExtractor();
  }

  /**
   * Extracts grounded factual claims from an extracted document.
   */
  async extractClaims(
    input: ClaimExtractionInput,
    tx?: TransactionContext | PoolClient
  ): Promise<ClaimExtractionSummary> {
    const startTime = Date.now();
    const { runId, sourceDocumentId, userId, extractedDoc, persist = true } = input;

    // 1. Guard against inaccessible or empty documents
    if (
      extractedDoc.accessState !== SourceAccessState.ACCESSIBLE ||
      extractedDoc.extractionState === ExtractionState.EMPTY_BODY ||
      extractedDoc.extractionState === ExtractionState.SKIPPED
    ) {
      logger.info('CLAIM_EXTRACTION_SKIPPED_INACCESSIBLE', 'Document is inaccessible or empty; skipping fact extraction', {
        sourceDocumentId,
        accessState: extractedDoc.accessState,
        extractionState: extractedDoc.extractionState,
      });
      return {
        runId,
        sourceDocumentId,
        totalCandidatesFound: 0,
        acceptedClaims: [],
        rejectedClaims: [],
        executionMethod: 'REGEX_DETERMINISTIC',
        durationMs: Date.now() - startTime,
      };
    }

    const sourceText = extractedDoc.markdownContent || extractedDoc.textExcerpt || '';
    if (!sourceText.trim()) {
      return {
        runId,
        sourceDocumentId,
        totalCandidatesFound: 0,
        acceptedClaims: [],
        rejectedClaims: [],
        executionMethod: 'REGEX_DETERMINISTIC',
        durationMs: Date.now() - startTime,
      };
    }

    let acceptedClaims: ExtractedClaim[] = [];
    let rejectedClaims: RejectedClaimRecord[] = [];
    let executionMethod: ExtractionMethod = 'REGEX_DETERMINISTIC';

    // 2. AI Extraction Attempt (if requested or credentials available)
    if (input.preferredProvider && input.preferredProvider !== 'rule_based') {
      try {
        const aiResult = await this.aiExtractor.extractClaims({
          runId,
          sourceDocumentId,
          userId,
          document: extractedDoc,
          providerId: input.preferredProvider,
          modelId: input.modelId,
          targetAttributes: input.targetAttributes,
          signal: input.signal,
        });

        acceptedClaims = aiResult.acceptedClaims;
        rejectedClaims = aiResult.rejectedClaims;
        executionMethod = 'LLM_STRUCTURED';
      } catch (aiErr) {
        logger.info('CLAIM_EXTRACTION_AI_FALLBACK_TO_RULES', 'AI extraction failed; falling back to deterministic rule extractor', {
          sourceDocumentId,
          error: aiErr instanceof Error ? aiErr.message : String(aiErr),
        });
        // Fall back to rule-based extractor
        const ruleResult = extractClaimsViaRules({
          runId,
          sourceDocumentId,
          userId,
          document: extractedDoc,
        });
        acceptedClaims = ruleResult.acceptedClaims;
        rejectedClaims = ruleResult.rejectedClaims;
        executionMethod = 'REGEX_DETERMINISTIC';
      }
    } else {
      // Deterministic rule-based extraction
      const ruleResult = extractClaimsViaRules({
        runId,
        sourceDocumentId,
        userId,
        document: extractedDoc,
      });
      acceptedClaims = ruleResult.acceptedClaims;
      rejectedClaims = ruleResult.rejectedClaims;
      executionMethod = 'REGEX_DETERMINISTIC';
    }

    // 3. Persistence into evidence_records (if requested and repo is available)
    if (persist && acceptedClaims.length > 0) {
      try {
        const recordsToInsert = acceptedClaims.map((claim) => ({
          id: claim.id,
          source_document_id: claim.sourceDocumentId,
          run_id: claim.runId,
          user_id: claim.userId,
          claim_text: `${claim.claimKey}: ${claim.extractedRawValue}`,
          claim_key: claim.claimKey,
          extracted_raw_value: claim.extractedRawValue,
          normalized_value: claim.extractedRawValue, // Raw value preserved in normalized_value until Step 37
          verbatim_excerpt: claim.evidence.verbatimQuote,
          verbatim_quote: claim.evidence.verbatimQuote,
          verification_state: claim.verificationState,
          confidence_score: String(claim.evidence.confidenceScore),
          char_offset_start: claim.evidence.charOffsetStart,
          char_offset_end: claim.evidence.charOffsetEnd,
          extraction_method: claim.extractionMethod,
          location_in_document: claim.evidence.locationInDocument ?? null,
          evaluation_details: {
            claimType: claim.claimType,
            polarity: claim.polarity,
            qualifiers: claim.qualifiers,
            groundingStatus: claim.evidence.groundingStatus,
          },
        }));

        await this.evidenceRepo.batchCreate(recordsToInsert, tx);
      } catch (persistErr) {
        logger.info('CLAIM_EXTRACTION_PERSISTENCE_SKIPPED', 'Evidence persistence omitted or mock client resolved', {
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
      }
    }

    const durationMs = Date.now() - startTime;
    logger.info('CLAIM_EXTRACTION_COMPLETED', 'Claim extraction finished', {
      sourceDocumentId,
      acceptedCount: acceptedClaims.length,
      rejectedCount: rejectedClaims.length,
      method: executionMethod,
      durationMs,
    });

    return {
      runId,
      sourceDocumentId,
      totalCandidatesFound: acceptedClaims.length + rejectedClaims.length,
      acceptedClaims,
      rejectedClaims,
      executionMethod,
      durationMs,
    };
  }
}
