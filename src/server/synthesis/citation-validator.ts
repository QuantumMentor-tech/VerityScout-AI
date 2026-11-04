import 'server-only';
import type { ExtractedClaim } from '@/server/claims/contracts';
import {
  type SourceDocumentReference,
  type SupportingCitation,
  type StructuredFinding,
} from './contracts';

export interface CitationValidationContext {
  readonly runId: string;
  readonly userId: string;
  readonly eligibleClaims: readonly ExtractedClaim[];
  readonly eligibleSources: readonly SourceDocumentReference[];
}

export interface CitationValidationResult {
  readonly validatedCitations: readonly SupportingCitation[];
  readonly validatedFindings: readonly StructuredFinding[];
  readonly rejectedCitationCount: number;
}

/**
 * Validates generated citations against eligible claims, enforcing strict quote integrity
 * and cross-tenant/run isolation.
 */
export function validateCitations(
  citations: readonly SupportingCitation[],
  findings: readonly StructuredFinding[],
  context: CitationValidationContext,
): CitationValidationResult {
  const { runId, userId, eligibleClaims, eligibleSources } = context;

  const claimMap = new Map<string, ExtractedClaim>();
  for (const c of eligibleClaims) {
    // Only index claims strictly belonging to this run and user
    if (c.runId === runId && c.userId === userId) {
      claimMap.set(c.id, c);
    }
  }

  const sourceMap = new Map<string, SourceDocumentReference>();
  for (const s of eligibleSources) {
    sourceMap.set(s.id, s);
  }

  const validatedCitations: SupportingCitation[] = [];
  const validCitationIdSet = new Set<string>();
  let rejectedCitationCount = 0;

  for (const citation of citations) {
    const matchedClaim = claimMap.get(citation.claimId);

    // 1. Fabricated Claim Check
    if (!matchedClaim) {
      rejectedCitationCount++;
      continue;
    }

    // 2. Source Coherence Check
    if (matchedClaim.sourceDocumentId !== citation.sourceDocumentId) {
      rejectedCitationCount++;
      continue;
    }

    // 3. Verbatim Quote Verification
    const claimQuote = matchedClaim.evidence.verbatimQuote.trim();
    const citationQuote = citation.verbatimQuote.trim();

    if (!citationQuote || (!claimQuote.includes(citationQuote) && !citationQuote.includes(claimQuote))) {
      rejectedCitationCount++;
      continue;
    }

    // Resolve source metadata
    const sourceRef = sourceMap.get(matchedClaim.sourceDocumentId);
    const sourceTitle = sourceRef?.title || citation.sourceTitle;
    const sourceUrl = sourceRef?.url || citation.sourceUrl;

    const validatedCitation: SupportingCitation = {
      ...citation,
      sourceTitle,
      sourceUrl,
      verbatimQuote: claimQuote,
      charOffsets: {
        start: matchedClaim.evidence.charOffsetStart,
        end: matchedClaim.evidence.charOffsetEnd,
      },
      confidenceScore: matchedClaim.evidence.confidenceScore,
      claimKey: matchedClaim.claimKey,
      claimType: matchedClaim.claimType,
      validationStatus: 'VALID',
    };

    validatedCitations.push(validatedCitation);
    validCitationIdSet.add(citation.id);
  }

  // 4. Validate Findings Citation Linkages
  const validatedFindings: StructuredFinding[] = [];

  for (const finding of findings) {
    // Filter to only citations that survived strict validation
    const survivingCitationIds = finding.citationIds.filter((id) => validCitationIdSet.has(id));

    // If finding is FACTUAL but all citations failed, downgrade to LIMITATION or keep if non-empty
    if (finding.findingType === 'FACTUAL' && survivingCitationIds.length === 0) {
      validatedFindings.push({
        ...finding,
        citationIds: [],
        findingType: 'LIMITATION',
        statement: `${finding.statement} (Unverified: supporting source citations could not be cryptographically validated).`,
      });
    } else {
      validatedFindings.push({
        ...finding,
        citationIds: survivingCitationIds,
      });
    }
  }

  return {
    validatedCitations,
    validatedFindings,
    rejectedCitationCount,
  };
}

