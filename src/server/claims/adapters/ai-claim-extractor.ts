import 'server-only';
import { randomUUID } from 'node:crypto';
import type { ExtractedDocument } from '@/server/extraction/contracts';
import {
  type ExtractedClaim,
  type RejectedClaimRecord,
  RawModelOutputSchema,
} from '../contracts';
import { verifyEvidenceGrounding } from '../evidence-grounder';
import {
  CLAIM_EXTRACTION_SYSTEM_PROMPT,
  buildClaimExtractionUserPrompt,
} from '../prompt-template';
import { getDefaultProviderRegistry } from '@/server/providers/registry';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import type { AiProviderId } from '@/server/providers/contracts/provider-id';
import {
  type ModelRouterService,
  getDefaultModelRouterService,
} from '@/server/models/router';
import { VerificationState } from '@/server/persistence/types';
import { logger } from '@/lib/logging/logger';

export interface AiExtractionOptions {
  readonly runId: string;
  readonly sourceDocumentId: string;
  readonly userId: string;
  readonly document: ExtractedDocument;
  readonly providerId?: AiProviderId | undefined;
  readonly modelId?: string | undefined;
  readonly targetAttributes?: readonly string[] | undefined;
  readonly explicitApiKey?: string | undefined;
  readonly useAutoPick?: boolean | undefined;
  readonly signal?: AbortSignal | undefined;
}

export class AiClaimExtractor {
  private readonly credentialService: ProviderCredentialService;
  private readonly routerService?: ModelRouterService | undefined;

  constructor(
    credentialService?: ProviderCredentialService,
    routerService?: ModelRouterService
  ) {
    this.credentialService = credentialService ?? new ProviderCredentialService();
    this.routerService = routerService;
  }

  /**
   * Executes AI-assisted structured claim extraction with strict quote grounding.
   */
  async extractClaims(
    options: AiExtractionOptions
  ): Promise<{ acceptedClaims: ExtractedClaim[]; rejectedClaims: RejectedClaimRecord[] }> {
    const {
      runId,
      sourceDocumentId,
      userId,
      document,
      providerId = 'openai',
      targetAttributes,
      explicitApiKey,
      useAutoPick,
      signal,
    } = options;

    let targetProviderId: AiProviderId = providerId;
    let targetModelId = options.modelId;

    if (useAutoPick) {
      const router = this.routerService ?? getDefaultModelRouterService();
      const decision = await router.route({
        userId,
        operationType: 'claim_extraction',
        routingMode: 'AUTO_PICK',
        allowFallback: true,
        correlationId: `claim-extraction-${runId}`,
      });

      if (decision.status === 'SUCCESS' && decision.selectedModel) {
        targetProviderId = decision.selectedModel.providerId;
        targetModelId = decision.selectedModel.nativeModelId;
      } else {
        throw new Error(
          `Auto-Pick model routing failed for claim extraction: ${decision.explanation}`
        );
      }
    }

    const sourceText = document.markdownContent || document.textExcerpt || '';
    if (!sourceText.trim()) {
      return { acceptedClaims: [], rejectedClaims: [] };
    }

    // 1. Resolve Provider and Credential
    let apiKey = explicitApiKey;
    if (!apiKey) {
      apiKey = (await this.credentialService.getDecryptedCredential(userId, targetProviderId)) ?? undefined;
    }

    if (!apiKey) {
      throw new Error(`No credentials configured for AI provider "${targetProviderId}".`);
    }

    const registry = getDefaultProviderRegistry();
    const adapter = registry.getAdapter(targetProviderId);
    if (!adapter) {
      throw new Error(`AI Provider adapter "${targetProviderId}" is not registered.`);
    }

    // 2. Select default model if unprovided
    const model = targetModelId || (targetProviderId === 'openai' ? 'gpt-4o-mini' : 'meta/llama-3.1-70b-instruct');

    // 3. Build Prompt with Untrusted Document Enclosure
    const userPrompt = buildClaimExtractionUserPrompt(document.title, sourceText, targetAttributes);

    // 4. Dispatch Inference Request
    const result = await registry.generateText(
      {
        modelRef: { providerId: targetProviderId, modelId: model },
        messages: [
          { role: 'system', content: CLAIM_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        responseFormat: { type: 'json_object' },
        ...(signal ? { abortSignal: signal } : {}),
      },
      {
        userId,
        correlationId: `${runId}-${sourceDocumentId}`,
        runId,
        operationType: 'claim_extraction',
        ...(signal ? { abortSignal: signal } : {}),
      }
    );

    if (!result.success) {
      throw new Error(`AI inference failed: ${result.error.message}`);
    }

    // 5. Parse Untrusted JSON Response
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(result.data.text);
    } catch (parseErr) {
      logger.info('CLAIM_EXTRACTION_JSON_PARSE_ERROR', 'Model returned malformed JSON', {
        rawText: result.data.text.substring(0, 300),
      });
      return {
        acceptedClaims: [],
        rejectedClaims: [
          {
            rawClaim: result.data.text,
            reason: `Model response is not valid JSON: ${(parseErr as Error).message}`,
            code: 'SCHEMA_VIOLATION',
          },
        ],
      };
    }

    const parseOutcome = RawModelOutputSchema.safeParse(parsedJson);
    if (!parseOutcome.success) {
      return {
        acceptedClaims: [],
        rejectedClaims: [
          {
            rawClaim: parsedJson,
            reason: `Model output does not conform to claims schema: ${parseOutcome.error.message}`,
            code: 'SCHEMA_VIOLATION',
          },
        ],
      };
    }

    // 6. Evidence Grounding Verification
    const acceptedClaims: ExtractedClaim[] = [];
    const rejectedClaims: RejectedClaimRecord[] = [];
    const now = new Date().toISOString();

    for (const rawClaim of parseOutcome.data.claims) {
      const grounding = verifyEvidenceGrounding(
        sourceText,
        rawClaim.verbatim_quote,
        null,
        null,
        rawClaim.location_in_document
      );

      if (!grounding.isGrounded || !grounding.span) {
        rejectedClaims.push({
          rawClaim,
          reason: grounding.reason ?? 'Claim verbatim quote not grounded in document text',
          code: 'UNVERIFIED_QUOTE',
        });
        continue;
      }

      const claim: ExtractedClaim = {
        id: randomUUID(),
        runId,
        sourceDocumentId,
        userId,
        subject: rawClaim.subject ?? document.title,
        claimKey: rawClaim.claim_key.toLowerCase().trim(),
        extractedRawValue: rawClaim.raw_value.trim(),
        claimType: rawClaim.claim_type,
        polarity: rawClaim.polarity,
        qualifiers: rawClaim.qualifiers ?? [],
        evidence: grounding.span,
        extractionStatus: 'EXPLICIT',
        extractionMethod: 'LLM_STRUCTURED',
        verificationState: VerificationState.SUPPORTED,
        extractedAt: now,
      };

      acceptedClaims.push(claim);
    }

    return { acceptedClaims, rejectedClaims };
  }
}
