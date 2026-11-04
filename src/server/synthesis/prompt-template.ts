import 'server-only';
import type { ExtractedClaim } from '@/server/claims/contracts';
import type { SourceDocumentReference } from './contracts';

export const RESEARCH_SYNTHESIS_SYSTEM_PROMPT = `
You are the VerityScout AI Evidence Synthesis Engine.
Your responsibility is to synthesize research outputs into an evidence-grounded, verifiable response.

Strict Grounding Rules:
1. Grounding Mandate: Every material factual statement MUST cite one or more provided evidence IDs.
2. Zero Hallucination: Do NOT invent statistics, product specs, quotes, consensus, or external facts not present in the provided evidence.
3. Conflict Preservation: If sources contradict each other, explicitly document the disagreement in the "conflicts" array. Never invent a resolution.
4. Uncertainty & Missing Evidence: If requested information is absent or ambiguous, document it in the "uncertaintiesAndLimitations" array.
5. Format: Return ONLY a valid JSON object matching the requested schema. No surrounding markdown, no conversational commentary.
`.trim();

/**
 * Builds the user prompt enclosing untrusted evidence data safely.
 */
export function buildSynthesisUserPrompt(
  query: string,
  claims: readonly ExtractedClaim[],
  sources: readonly SourceDocumentReference[],
): string {
  const sourceLookup = new Map<string, SourceDocumentReference>();
  for (const s of sources) {
    sourceLookup.set(s.id, s);
  }

  const claimEntries = claims.map((c, index) => {
    const s = sourceLookup.get(c.sourceDocumentId);
    return `[Evidence ID: cite_${index + 1}]
- Claim ID: ${c.id}
- Source ID: ${c.sourceDocumentId}
- Source Title: ${s?.title ?? 'Unknown Source'}
- Source URL: ${s?.url ?? ''}
- Claim Key: ${c.claimKey}
- Claim Value: ${c.extractedRawValue}
- Verbatim Excerpt: "${c.evidence.verbatimQuote}"
`;
  }).join('\n');

  return `
User Research Query: "${query}"

<untrusted_evidence_data>
${claimEntries || 'No eligible evidence records found for this query.'}
</untrusted_evidence_data>

Instructions:
1. Provide a direct, concise answer to the user query based ONLY on the evidence above.
2. Emit structured "keyFindings" where each finding references valid Evidence IDs (e.g., ["cite_1"]).
3. List all used citations in "supportingCitations".
4. Document any material disagreements between sources in "conflicts".
5. Note missing or ambiguous information in "uncertaintiesAndLimitations".
`.trim();
}

