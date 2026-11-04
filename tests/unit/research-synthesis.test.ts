import { describe, it, expect } from 'vitest';
import { VerificationState, MatchClassification } from '@/server/persistence/types';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type { ConstraintEvaluationRecord, CandidateConstraintEvaluationSummary } from '@/server/evaluation/contracts';
import {
  ResearchSynthesisOutputSchema,
  validateCitations,
  synthesizeViaRules,
  deriveMatchClassification,
  getDefaultSynthesisService,
  type ResearchSynthesisInput,
  type SourceDocumentReference,
  type SupportingCitation,
  type StructuredFinding,
} from '@/server/synthesis';

describe('Step 40: General Evidence-Linked Research Synthesis', () => {
  const baseRunId = 'run_synth_001';
  const baseUserId = 'user_synth_001';

  const mockSources: SourceDocumentReference[] = [
    {
      id: 'doc_1',
      url: 'https://techreview.com/sony-wh1000xm5',
      title: 'Sony WH-1000XM5 Full Review: Class-Leading ANC',
      domain: 'techreview.com',
      publishedAt: '2024-03-15T10:00:00Z',
    },
    {
      id: 'doc_2',
      url: 'https://audiofacts.org/sony-headphones-battery',
      title: 'Headphones Battery Life Benchmarks 2024',
      domain: 'audiofacts.org',
      publishedAt: '2024-04-01T14:30:00Z',
    },
  ];

  const mockClaims: ExtractedClaim[] = [
    {
      id: 'claim_price_1',
      runId: baseRunId,
      sourceDocumentId: 'doc_1',
      userId: baseUserId,
      subject: 'Sony WH-1000XM5',
      claimKey: 'price',
      extractedRawValue: '$398.00',
      claimType: 'PRICE',
      polarity: 'POSITIVE',
      qualifiers: [],
      evidence: {
        verbatimQuote: 'The Sony WH-1000XM5 retails for $398.00 at major retailers.',
        charOffsetStart: 100,
        charOffsetEnd: 159,
        groundingStatus: 'GROUNDED_EXACT',
        confidenceScore: 0.98,
      },
      extractionStatus: 'EXPLICIT',
      extractionMethod: 'REGEX_DETERMINISTIC',
      verificationState: VerificationState.SUPPORTED,
      extractedAt: new Date().toISOString(),
    },
    {
      id: 'claim_battery_1',
      runId: baseRunId,
      sourceDocumentId: 'doc_2',
      userId: baseUserId,
      subject: 'Sony WH-1000XM5',
      claimKey: 'battery_life',
      extractedRawValue: '30 hours',
      claimType: 'SPECIFICATION',
      polarity: 'POSITIVE',
      qualifiers: [],
      evidence: {
        verbatimQuote: 'In our testing, battery runtime was measured at 30 hours with ANC enabled.',
        charOffsetStart: 45,
        charOffsetEnd: 119,
        groundingStatus: 'GROUNDED_EXACT',
        confidenceScore: 0.95,
      },
      extractionStatus: 'EXPLICIT',
      extractionMethod: 'REGEX_DETERMINISTIC',
      verificationState: VerificationState.SUPPORTED,
      extractedAt: new Date().toISOString(),
    },
  ];

  // ---------------------------------------------------------------------------
  // 1. Citation Validation & Grounding Tests (AC-03, AC-04)
  // ---------------------------------------------------------------------------
  describe('Citation Validation & Evidence Integrity', () => {
    it('SYNTH-CITE-001: Validates legitimate citations with exact quote matching', () => {
      const citations: SupportingCitation[] = [
        {
          id: 'cite_1',
          claimId: 'claim_price_1',
          sourceDocumentId: 'doc_1',
          sourceTitle: 'Tech Review',
          sourceUrl: 'https://techreview.com/sony-wh1000xm5',
          verbatimQuote: 'The Sony WH-1000XM5 retails for $398.00 at major retailers.',
          validationStatus: 'VALID',
        },
      ];

      const findings: StructuredFinding[] = [
        {
          id: 'find_1',
          title: 'Price Overview',
          statement: 'The headset is available for $398.00.',
          citationIds: ['cite_1'],
          findingType: 'FACTUAL',
          isDecisive: true,
        },
      ];

      const result = validateCitations(citations, findings, {
        runId: baseRunId,
        userId: baseUserId,
        eligibleClaims: mockClaims,
        eligibleSources: mockSources,
      });

      expect(result.validatedCitations.length).toBe(1);
      expect(result.validatedCitations[0]?.validationStatus).toBe('VALID');
      expect(result.validatedFindings[0]?.citationIds).toContain('cite_1');
      expect(result.rejectedCitationCount).toBe(0);
    });

    it('SYNTH-CITE-002: Rejects fabricated citation IDs not present in eligible claims', () => {
      const fakeCitation: SupportingCitation = {
        id: 'cite_fake',
        claimId: 'claim_hallucinated_by_llm',
        sourceDocumentId: 'doc_1',
        sourceTitle: 'Tech Review',
        sourceUrl: 'https://techreview.com',
        verbatimQuote: 'Some fabricated quote.',
        validationStatus: 'VALID',
      };

      const findings: StructuredFinding[] = [
        {
          id: 'find_fake',
          title: 'Fake Finding',
          statement: 'Fabricated statement.',
          citationIds: ['cite_fake'],
          findingType: 'FACTUAL',
          isDecisive: false,
        },
      ];

      const result = validateCitations([fakeCitation], findings, {
        runId: baseRunId,
        userId: baseUserId,
        eligibleClaims: mockClaims,
        eligibleSources: mockSources,
      });

      expect(result.validatedCitations.length).toBe(0);
      expect(result.rejectedCitationCount).toBe(1);
      // Finding is downgraded to LIMITATION because its citation was rejected
      expect(result.validatedFindings[0]?.findingType).toBe('LIMITATION');
      expect(result.validatedFindings[0]?.citationIds.length).toBe(0);
    });

    it('SYNTH-CITE-003: Rejects cross-user or wrong-run citations (tenant isolation AC-10)', () => {
      const crossTenantClaim: ExtractedClaim = {
        ...mockClaims[0]!,
        id: 'claim_cross_tenant',
        userId: 'other_user_id',
      };

      const citation: SupportingCitation = {
        id: 'cite_x',
        claimId: 'claim_cross_tenant',
        sourceDocumentId: 'doc_1',
        sourceTitle: 'Tech Review',
        sourceUrl: 'https://techreview.com',
        verbatimQuote: mockClaims[0]!.evidence.verbatimQuote,
        validationStatus: 'VALID',
      };

      const result = validateCitations([citation], [], {
        runId: baseRunId,
        userId: baseUserId, // Mismatch with other_user_id
        eligibleClaims: [crossTenantClaim],
        eligibleSources: mockSources,
      });

      expect(result.validatedCitations.length).toBe(0);
      expect(result.rejectedCitationCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Conflict & Uncertainty Preservation Tests (AC-05, AC-06)
  // ---------------------------------------------------------------------------
  describe('Conflict & Uncertainty Preservation', () => {
    it('SYNTH-CONF-001: Preserves material source conflicts from Step 38 without choosing a winner', () => {
      const conflictEval: ConstraintEvaluationRecord = {
        id: 'eval_conf_1',
        constraintId: 'c_price',
        constraintKey: 'price',
        constraintType: 'PRICE_CEILING',
        constraintPriority: 'REQUIRED',
        operator: 'LTE',
        targetValue: 500,
        state: 'CONFLICTING_EVIDENCE',
        reasonCode: 'CONFLICTING_ELIGIBLE_CLAIMS',
        explanation: 'Source A states $398 while Source B states $699 for the same product without sale context.',
        evidenceReferences: [
          {
            claimId: 'claim_price_1',
            sourceDocumentId: 'doc_1',
            verbatimQuote: 'Price is $398.00',
          },
        ],
        isApproximate: false,
        isRange: false,
        evaluatedAt: new Date().toISOString(),
        rulesetVersion: 'v1.0',
      };

      const input: ResearchSynthesisInput = {
        runId: baseRunId,
        userId: baseUserId,
        query: 'What is the price of the Sony WH-1000XM5?',
        claims: mockClaims,
        sources: mockSources,
        evaluations: [conflictEval],
      };

      const output = synthesizeViaRules(input);

      expect(output.conflicts.length).toBe(1);
      expect(output.conflicts[0]?.topic).toBe('price');
      expect(output.conflicts[0]?.explanation).toContain('Source A states $398 while Source B states $699');
      expect(output.conflicts[0]?.conflictingClaimIds).toContain('claim_price_1');
    });

    it('SYNTH-UNCERT-001: Preserves missing evidence and approximations as uncertainties', () => {
      const missingEval: ConstraintEvaluationRecord = {
        id: 'eval_miss_1',
        constraintId: 'c_waterproof',
        constraintKey: 'waterproof_rating',
        constraintType: 'SPECIFICATION',
        constraintPriority: 'REQUIRED',
        operator: 'EQ',
        targetValue: 'IPX7',
        state: 'UNKNOWN',
        reasonCode: 'ATTRIBUTE_EVIDENCE_MISSING',
        explanation: 'No evidence found in candidate sources regarding waterproof_rating.',
        evidenceReferences: [],
        isApproximate: false,
        isRange: false,
        evaluatedAt: new Date().toISOString(),
        rulesetVersion: 'v1.0',
      };

      const input: ResearchSynthesisInput = {
        runId: baseRunId,
        userId: baseUserId,
        query: 'Is the Sony WH-1000XM5 waterproof?',
        claims: mockClaims,
        sources: mockSources,
        evaluations: [missingEval],
      };

      const output = synthesizeViaRules(input);

      expect(output.uncertaintiesAndLimitations.length).toBe(1);
      expect(output.uncertaintiesAndLimitations[0]?.topic).toBe('waterproof_rating');
      expect(output.uncertaintiesAndLimitations[0]?.unresolvedReasonCode).toBe('ATTRIBUTE_EVIDENCE_MISSING');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Classification-Aware Synthesis (AC-07)
  // ---------------------------------------------------------------------------
  describe('Classification-Aware Synthesis & Derivation', () => {
    it('SYNTH-CLASS-001: Derives EXACT_MATCH when all required and preferred constraints pass', () => {
      const summary: CandidateConstraintEvaluationSummary = {
        candidateId: 'cand_1',
        runId: baseRunId,
        userId: baseUserId,
        totalConstraintsEvaluated: 3,
        satisfiedCount: 3,
        violatedCount: 0,
        unknownCount: 0,
        conflictingCount: 0,
        notComparableCount: 0,
        invalidCount: 0,
        requiredSummary: { total: 2, satisfied: 2, violated: 0, unresolved: 0 },
        excludedSummary: { total: 1, satisfied: 1, violated: 0, unresolved: 0 },
        preferredSummary: { total: 0, satisfied: 0, violated: 0, unresolved: 0 },
        evaluations: [],
        passedConstraintKeys: ['price', 'battery_life'],
        failedConstraintKeys: [],
        unresolvedConstraintKeys: [],
        evaluatedAt: new Date().toISOString(),
        rulesetVersion: 'v1.0',
      };

      const { classification } = deriveMatchClassification(summary);
      expect(classification).toBe(MatchClassification.EXACT_MATCH);
    });

    it('SYNTH-CLASS-002: Derives NEAR_MATCH when required pass but preferred has violations', () => {
      const summary: CandidateConstraintEvaluationSummary = {
        candidateId: 'cand_near',
        runId: baseRunId,
        userId: baseUserId,
        totalConstraintsEvaluated: 3,
        satisfiedCount: 2,
        violatedCount: 1,
        unknownCount: 0,
        conflictingCount: 0,
        notComparableCount: 0,
        invalidCount: 0,
        requiredSummary: { total: 2, satisfied: 2, violated: 0, unresolved: 0 },
        excludedSummary: { total: 0, satisfied: 0, violated: 0, unresolved: 0 },
        preferredSummary: { total: 1, satisfied: 0, violated: 1, unresolved: 0 },
        evaluations: [],
        passedConstraintKeys: ['price', 'battery'],
        failedConstraintKeys: ['color'],
        unresolvedConstraintKeys: [],
        evaluatedAt: new Date().toISOString(),
        rulesetVersion: 'v1.0',
      };

      const { classification, reason } = deriveMatchClassification(summary);
      expect(classification).toBe(MatchClassification.NEAR_MATCH);
      expect(reason).toContain('preferred criteria were not met');
    });

    it('SYNTH-CLASS-003: Derives EXCLUDED when an exclusion or required constraint is violated', () => {
      const summary: CandidateConstraintEvaluationSummary = {
        candidateId: 'cand_excl',
        runId: baseRunId,
        userId: baseUserId,
        totalConstraintsEvaluated: 2,
        satisfiedCount: 1,
        violatedCount: 1,
        unknownCount: 0,
        conflictingCount: 0,
        notComparableCount: 0,
        invalidCount: 0,
        requiredSummary: { total: 1, satisfied: 1, violated: 0, unresolved: 0 },
        excludedSummary: { total: 1, satisfied: 0, violated: 1, unresolved: 0 },
        preferredSummary: { total: 0, satisfied: 0, violated: 0, unresolved: 0 },
        evaluations: [],
        passedConstraintKeys: ['price'],
        failedConstraintKeys: ['refurbished_exclusion'],
        unresolvedConstraintKeys: [],
        primaryMismatchReason: 'Candidate violates exclusion: condition is confirmed as REFURBISHED.',
        evaluatedAt: new Date().toISOString(),
        rulesetVersion: 'v1.0',
      };

      const { classification } = deriveMatchClassification(summary);
      expect(classification).toBe(MatchClassification.EXCLUDED);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. End-to-End Research Synthesis Service (AC-01, AC-02, AC-11)
  // ---------------------------------------------------------------------------
  describe('ResearchSynthesisService Execution', () => {
    it('SYNTH-SVC-001: Synthesizes complete research response conforming to Zod schema', async () => {
      const service = getDefaultSynthesisService();

      const input: ResearchSynthesisInput = {
        runId: baseRunId,
        userId: baseUserId,
        query: 'What are the specifications and price of the Sony WH-1000XM5?',
        claims: mockClaims,
        sources: mockSources,
        preferredStrategy: 'rule_based',
      };

      const output = await service.synthesize(input);

      // Validate Zod schema conformity
      const validated = ResearchSynthesisOutputSchema.parse(output);
      expect(validated.status).toBe('SUCCESS');
      expect(validated.runId).toBe(baseRunId);
      expect(validated.directAnswer).toBeDefined();
      expect(validated.keyFindings.length).toBe(2);
      expect(validated.supportingCitations.length).toBe(2);
      expect(validated.metadata.synthesizerStrategy).toBe('RULE_BASED');
      expect(validated.metadata.evidenceCoverage.totalEligibleClaims).toBe(2);
      expect(validated.metadata.evidenceCoverage.citedClaimsCount).toBe(2);
    });

    it('SYNTH-SVC-002: Handles empty evidence gracefully with status EMPTY', async () => {
      const service = getDefaultSynthesisService();

      const input: ResearchSynthesisInput = {
        runId: baseRunId,
        userId: baseUserId,
        query: 'Quantum gravity warp drive specifications',
        claims: [],
        sources: [],
        preferredStrategy: 'rule_based',
      };

      const output = await service.synthesize(input);
      expect(output.status).toBe('EMPTY');
      expect(output.directAnswer).toContain('No evidence records were found');
      expect(output.keyFindings.length).toBe(0);
      expect(output.supportingCitations.length).toBe(0);
    });

    it('SYNTH-SVC-003: Determinism Guarantee: repeated runs produce identical substantive findings', async () => {
      const service = getDefaultSynthesisService();

      const input: ResearchSynthesisInput = {
        runId: baseRunId,
        userId: baseUserId,
        query: 'Sony WH-1000XM5 Review',
        claims: mockClaims,
        sources: mockSources,
        preferredStrategy: 'rule_based',
      };

      const res1 = await service.synthesize(input);
      const res2 = await service.synthesize(input);

      expect(res1.status).toBe(res2.status);
      expect(res1.directAnswer).toBe(res2.directAnswer);
      expect(res1.keyFindings.map((f) => f.statement)).toEqual(res2.keyFindings.map((f) => f.statement));
      expect(res1.supportingCitations.map((c) => c.claimId)).toEqual(
        res2.supportingCitations.map((c) => c.claimId),
      );
    });
  });
});

