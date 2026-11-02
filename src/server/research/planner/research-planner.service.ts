import 'server-only';
import { randomUUID } from 'node:crypto';
import type { AiProviderAdapter } from '@/server/providers/contracts/adapter';
import {
  type ResearchPlan,
  type ResearchPlanInput,
  type PlanStatus,
  type PlanWarning,
  type PlanningProvenance,
  ResearchPlanInputSchema,
  ResearchPlanSchema,
} from './contracts';
import { normalizeQueryText } from './normalizer';
import { extractIntentAndConstraints } from './constraint-extractor';
import { generateSearchQueryVariants } from './query-planner';

/**
 * Configuration options for ResearchPlannerService.
 */
export interface ResearchPlannerOptions {
  readonly aiAdapter?: AiProviderAdapter;
  readonly userId?: string;
  readonly maxSearchQueries?: number;
}

export class ResearchPlannerService {
  /**
   * Transforms natural-language query and structured constraints into a validated, provider-independent ResearchPlan.
   */
  public async planResearch(
    input: ResearchPlanInput,
    options?: ResearchPlannerOptions
  ): Promise<ResearchPlan> {
    // 1. Runtime validation of untrusted input
    const validatedInput = ResearchPlanInputSchema.parse(input);

    // 2. Conservative text normalization (NFKC, whitespace collapsing, quote preservation)
    const normalizedResult = normalizeQueryText(validatedInput.rawQuery);
    const normalizedQuery = normalizedResult.normalized;

    // 3. Deterministic constraint extraction & contradiction detection
    const extracted = extractIntentAndConstraints(
      normalizedQuery,
      validatedInput.structuredConstraints,
      validatedInput.taskTypeOverride
    );

    const warnings: PlanWarning[] = [...extracted.warnings];
    if (normalizedResult.isModified) {
      warnings.push({
        code: 'QUERY_WHITESPACE_NORMALIZED',
        message: 'Query whitespace and Unicode formatting were normalized conservatively.',
      });
    }

    const constraints = [...extracted.constraints];
    const ambiguities = [...extracted.ambiguities];
    let targetEntity = extracted.targetEntity;
    let provenance: PlanningProvenance = 'DETERMINISTIC_EXTRACTION';

    // 4. Optional AI-Assisted Interpretation Seam
    // If an approved provider adapter and userId are supplied, we can invoke semantic interpretation
    if (options?.aiAdapter && options?.userId) {
      try {
        const aiResult = await options.aiAdapter.generateText(
          {
            modelRef: { providerId: options.aiAdapter.id, modelId: 'planner-default' },
            messages: [
              {
                role: 'system',
                content:
                  'You are a research planning assistant. Extract target entity and specifications from the query as JSON.',
              },
              { role: 'user', content: normalizedQuery },
            ],
            responseFormat: { type: 'json_object' },
            temperature: 0.0,
          },
          { userId: options.userId, correlationId: randomUUID() }
        );

        if (aiResult.success) {
          try {
            const parsedAi = JSON.parse(aiResult.data.text) as { targetEntity?: string };
            if (parsedAi.targetEntity && typeof parsedAi.targetEntity === 'string' && parsedAi.targetEntity.trim()) {
              targetEntity = parsedAi.targetEntity.trim();
              provenance = 'AI_INFERRED';
            }
          } catch {
            warnings.push({
              code: 'AI_OUTPUT_PARSE_FAILED',
              message: 'AI output failed JSON parsing; retained deterministic entity extraction.',
            });
          }
        } else {
          warnings.push({
            code: 'AI_PLANNING_FALLBACK',
            message: `AI interpretation unavailable (${aiResult.error.code}); fell back to deterministic rules.`,
          });
        }
      } catch (err) {
        warnings.push({
          code: 'AI_INTERPRETATION_EXCEPTION',
          message: err instanceof Error ? err.message : 'AI interpretation failed; fell back to deterministic rules.',
        });
      }
    }

    // 5. Determine Overall Plan Status
    let status: PlanStatus = 'READY';
    const hasConflictingConstraints = ambiguities.some(a => a.code === 'CONFLICTING_CONSTRAINTS');
    const hasBlockingAmbiguity = ambiguities.some(a => a.code === 'MISSING_CURRENCY');

    if (hasConflictingConstraints) {
      status = 'INVALID';
    } else if (hasBlockingAmbiguity) {
      status = 'NEEDS_CLARIFICATION';
    }

    // 6. Generate 2 to 5 Diversified Search Queries
    const searchQueries = generateSearchQueryVariants(
      targetEntity,
      validatedInput.rawQuery,
      constraints,
      options?.maxSearchQueries !== undefined ? { maxQueries: options.maxSearchQueries } : undefined
    );

    const primaryQuery = searchQueries[0]?.query ?? targetEntity;

    // 7. Assemble Complete Research Plan
    const rawPlan: ResearchPlan = {
      id: randomUUID(),
      status,
      intent: {
        originalQuery: validatedInput.rawQuery,
        normalizedQuery,
        taskType: extracted.taskType,
        targetEntity,
        constraints,
        provenance,
      },
      primaryQuery,
      searchQueries,
      ambiguities,
      warnings,
      createdAt: new Date().toISOString(),
      plannerVersion: '1.0.0',
    };

    // 8. Runtime Schema Validation of Output Contract
    return ResearchPlanSchema.parse(rawPlan);
  }
}

let defaultPlannerService: ResearchPlannerService | null = null;

export function getResearchPlannerService(): ResearchPlannerService {
  if (!defaultPlannerService) {
    defaultPlannerService = new ResearchPlannerService();
  }
  return defaultPlannerService;
}
