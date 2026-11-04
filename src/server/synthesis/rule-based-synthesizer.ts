import 'server-only';
import { randomUUID } from 'node:crypto';
import { MatchClassification } from '@/server/persistence/types';
import {
  SYNTHESIS_RULESET_VERSION,
  type CandidateComparisonRow,
  type ResearchSynthesisInput,
  type ResearchSynthesisOutput,
  type SourceDocumentReference,
  type StructuredFinding,
  type SupportingCitation,
  type SynthesisConflict,
  type SynthesisUncertainty,
} from './contracts';
import { validateCitations } from './citation-validator';

/**
 * Derives MatchClassification deterministically from a candidate's constraint evaluation summary.
 */
export function deriveMatchClassification(summary: {
  requiredSummary: { total: number; satisfied: number; violated: number; unresolved: number };
  excludedSummary: { total: number; satisfied: number; violated: number; unresolved: number };
  preferredSummary: { total: number; satisfied: number; violated: number; unresolved: number };
  conflictingCount: number;
}): { classification: MatchClassification; reason: string } {
  // 1. Excluded Violation Check
  if (summary.excludedSummary.violated > 0) {
    return {
      classification: MatchClassification.EXCLUDED,
      reason: 'Candidate violated an explicit exclusion constraint.',
    };
  }

  // 2. Conflicting Evidence Check
  if (summary.conflictingCount > 0) {
    return {
      classification: MatchClassification.CONFLICTING,
      reason: 'Material contradictions exist among eligible evidence claims.',
    };
  }

  // 3. Required Hard Constraint Violation
  if (summary.requiredSummary.violated > 0) {
    return {
      classification: MatchClassification.EXCLUDED,
      reason: 'Candidate failed one or more required hard constraints.',
    };
  }

  // 4. Unresolved Required Constraints
  if (summary.requiredSummary.unresolved > 0) {
    return {
      classification: MatchClassification.PARTIALLY_VERIFIED,
      reason: 'One or more required constraints could not be verified due to missing or incomparable evidence.',
    };
  }

  // 5. Near Match (Required satisfied, but preferred violated)
  if (summary.preferredSummary.violated > 0) {
    return {
      classification: MatchClassification.NEAR_MATCH,
      reason: 'All required hard constraints satisfied, but one or more preferred criteria were not met.',
    };
  }

  // 6. Exact Match
  return {
    classification: MatchClassification.EXACT_MATCH,
    reason: 'All required and preferred constraints are supported as satisfied by eligible evidence.',
  };
}

/**
 * Deterministic offline rule-based research synthesizer.
 * Operates without external LLM calls, providing 100% evidence-grounded responses.
 */
export function synthesizeViaRules(input: ResearchSynthesisInput): ResearchSynthesisOutput {
  const startTime = Date.now();
  const { runId, userId, query, claims, sources, evaluations = [], candidateSummaries = [] } = input;

  const sourceLookup = new Map<string, SourceDocumentReference>();
  for (const s of sources) {
    sourceLookup.set(s.id, s);
  }

  // 1. Handle Empty Claims Edge Case
  if (claims.length === 0) {
    const emptyOutput: ResearchSynthesisOutput = {
      id: `synth_${randomUUID()}`,
      runId,
      userId,
      query,
      status: 'EMPTY',
      directAnswer: `No evidence records were found to answer the research query: "${query}".`,
      keyFindings: [],
      supportingCitations: [],
      conflicts: [],
      uncertaintiesAndLimitations: [
        {
          topic: 'Evidence Completeness',
          description: 'No eligible evidence records were retrieved for the requested query parameters.',
          unresolvedReasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
        },
      ],
      candidateComparisons: [],
      metadata: {
        synthesizedAt: new Date().toISOString(),
        rulesetVersion: SYNTHESIS_RULESET_VERSION,
        synthesizerStrategy: 'RULE_BASED',
        evidenceCoverage: {
          totalEligibleClaims: 0,
          citedClaimsCount: 0,
          sourcesCount: sources.length,
        },
        durationMs: Date.now() - startTime,
      },
    };
    return emptyOutput;
  }

  // 2. Build Supporting Citations
  const citations: SupportingCitation[] = [];
  const citationIdByClaimId = new Map<string, string>();

  claims.forEach((claim, idx) => {
    const citeId = `cite_${idx + 1}`;
    const source = sourceLookup.get(claim.sourceDocumentId);

    const citation: SupportingCitation = {
      id: citeId,
      claimId: claim.id,
      sourceDocumentId: claim.sourceDocumentId,
      sourceTitle: source?.title ?? 'Research Source Document',
      sourceUrl: source?.url ?? 'about:blank',
      verbatimQuote: claim.evidence.verbatimQuote,
      charOffsets: {
        start: claim.evidence.charOffsetStart,
        end: claim.evidence.charOffsetEnd,
      },
      confidenceScore: claim.evidence.confidenceScore,
      claimKey: claim.claimKey,
      claimType: claim.claimType,
      validationStatus: 'VALID',
    };

    citations.push(citation);
    citationIdByClaimId.set(claim.id, citeId);
  });

  // 3. Build Structured Findings
  const findings: StructuredFinding[] = [];
  claims.forEach((claim, idx) => {
    const citeId = citationIdByClaimId.get(claim.id);
    const finding: StructuredFinding = {
      id: `finding_${idx + 1}`,
      title: claim.claimKey.replace(/_/g, ' ').toUpperCase(),
      statement: `Source states that ${claim.claimKey.replace(/_/g, ' ')} is "${claim.extractedRawValue}".`,
      citationIds: citeId ? [citeId] : [],
      findingType: 'FACTUAL',
      isDecisive: claim.claimType === 'PRICE' || claim.claimType === 'SPECIFICATION',
    };
    findings.push(finding);
  });

  // 4. Capture Conflicts
  const conflicts: SynthesisConflict[] = [];

  // Upstream evaluation conflicts
  evaluations
    .filter((e) => e.state === 'CONFLICTING_EVIDENCE')
    .forEach((e) => {
      const conflictingClaimIds = e.evidenceReferences.map((r) => r.claimId);
      const conflictingCitationIds = conflictingClaimIds
        .map((id) => citationIdByClaimId.get(id))
        .filter((c): c is string => c !== undefined);

      conflicts.push({
        topic: e.constraintKey,
        explanation: e.explanation,
        conflictingClaimIds,
        conflictingCitationIds,
      });
    });

  // 5. Capture Uncertainties and Limitations
  const uncertainties: SynthesisUncertainty[] = [];

  evaluations
    .filter((e) => e.state === 'UNKNOWN' || e.state === 'NOT_COMPARABLE' || e.isApproximate)
    .forEach((e) => {
      uncertainties.push({
        topic: e.constraintKey,
        description: e.explanation,
        unresolvedReasonCode: e.reasonCode,
      });
    });

  // 6. Build Candidate Comparisons
  const candidateComparisons: CandidateComparisonRow[] = candidateSummaries.map((summary) => {
    const { classification, reason } = deriveMatchClassification(summary);
    return {
      candidateId: summary.candidateId,
      title: `Candidate ${summary.candidateId}`,
      matchClassification: classification,
      classificationReason: reason,
      keyAttributes: {},
      passedConstraints: summary.passedConstraintKeys,
      failedConstraints: summary.failedConstraintKeys,
      unresolvedConstraints: summary.unresolvedConstraintKeys,
      primaryMismatchReason: summary.primaryMismatchReason,
    };
  });

  // 7. Validate Citations (AC-04)
  const { validatedCitations, validatedFindings } = validateCitations(citations, findings, {
    runId,
    userId,
    eligibleClaims: claims,
    eligibleSources: sources,
  });

  // 8. Formulate Direct Answer
  const topFindings = validatedFindings.slice(0, 3).map((f) => f.statement).join(' ');
  const directAnswer = topFindings || `Evidence-backed analysis completed for query: "${query}".`;

  const status = validatedFindings.length > 0 ? 'SUCCESS' : 'PARTIAL';

  return {
    id: `synth_${randomUUID()}`,
    runId,
    userId,
    query,
    status,
    directAnswer,
    keyFindings: validatedFindings,
    supportingCitations: validatedCitations,
    conflicts,
    uncertaintiesAndLimitations: uncertainties,
    candidateComparisons,
    metadata: {
      synthesizedAt: new Date().toISOString(),
      rulesetVersion: SYNTHESIS_RULESET_VERSION,
      synthesizerStrategy: 'RULE_BASED',
      evidenceCoverage: {
        totalEligibleClaims: claims.length,
        citedClaimsCount: validatedCitations.length,
        sourcesCount: sources.length,
      },
      durationMs: Date.now() - startTime,
    },
  };
}

