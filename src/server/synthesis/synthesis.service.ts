import 'server-only';
import {
  ResearchSynthesisOutputSchema,
  type ResearchSynthesisInput,
  type ResearchSynthesisOutput,
} from './contracts';
import { synthesizeViaRules } from './rule-based-synthesizer';
import { AiResearchSynthesizer } from './ai-synthesizer';
import { logger } from '@/lib/logging/logger';

export const MAX_SYNTHESIS_CLAIMS = 50;
export const MAX_SYNTHESIS_SOURCES = 10;

export class ResearchSynthesisService {
  private readonly aiSynthesizer: AiResearchSynthesizer;

  constructor(aiSynthesizer?: AiResearchSynthesizer) {
    this.aiSynthesizer = aiSynthesizer ?? new AiResearchSynthesizer();
  }

  /**
   * Synthesizes research outputs into an evidence-linked, verifiable response.
   */
  async synthesize(input: ResearchSynthesisInput): Promise<ResearchSynthesisOutput> {
    const startTime = Date.now();

    // 1. Context Bounding (AC-12)
    const boundedClaims = input.claims.slice(0, MAX_SYNTHESIS_CLAIMS);
    const boundedSources = input.sources.slice(0, MAX_SYNTHESIS_SOURCES);

    const boundedInput: ResearchSynthesisInput = {
      ...input,
      claims: boundedClaims,
      sources: boundedSources,
    };

    // 2. Strategy Routing
    if (input.preferredStrategy === 'ai_provider') {
      try {
        const aiOutput = await this.aiSynthesizer.synthesize(boundedInput);
        return aiOutput;
      } catch (err) {
        logger.warn(
          'SYNTHESIS_STRATEGY_FALLBACK',
          'Falling back to deterministic rule-based synthesizer',
          {
            error: err instanceof Error ? err.message : String(err),
            runId: input.runId,
          },
        );
        // Graceful fallback to deterministic rule-based synthesis
      }
    }

    // Default or Fallback: Deterministic Rule-Based Synthesis
    const ruleOutput = synthesizeViaRules(boundedInput);
    const durationMs = Date.now() - startTime;

    const finalOutput: ResearchSynthesisOutput = {
      ...ruleOutput,
      metadata: {
        ...ruleOutput.metadata,
        durationMs,
      },
    };

    return ResearchSynthesisOutputSchema.parse(finalOutput);
  }
}

let defaultSynthesisService: ResearchSynthesisService | null = null;

export function getDefaultSynthesisService(): ResearchSynthesisService {
  if (!defaultSynthesisService) {
    defaultSynthesisService = new ResearchSynthesisService();
  }
  return defaultSynthesisService;
}
