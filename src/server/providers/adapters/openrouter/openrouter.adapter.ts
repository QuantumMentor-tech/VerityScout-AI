import 'server-only';

/**
 * VerityScout AI — OpenRouter Provider Adapter
 * Governed by: Step 29 (OpenRouter Provider Adapter, Model Identifier Mapping, Request/Response Normalization, Error Handling, and Integration Tests)
 *
 * Primary Architectural Rule:
 * Implements AiProviderAdapter for OpenRouter using the official Chat Completions API.
 * Server-only execution boundary with user-scoped credential isolation, zero secret leakage,
 * and distinct credit exhaustion (402) vs rate limit (429) handling.
 */

import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import type { AiProviderAdapter, ProviderOperationContext } from '../../contracts/adapter';
import type { ProviderMetadata } from '../../contracts/metadata';
import { BASELINE_PROVIDER_METADATA } from '../../contracts/metadata';
import type { ProviderCapabilities } from '../../contracts/capabilities';
import {
  type ModelDefinition,
  createModelReference,
} from '../../contracts/model';
import {
  type NormalizedInferenceRequest,
  type NormalizedInferenceResponse,
  validateInferenceRequest,
} from '../../contracts/inference';
import {
  type ProviderOperationResult,
  createSuccessResult,
  createErrorResult,
  createProviderError,
} from '../../contracts/operation-result';
import {
  testProviderConnection,
  type ConnectionTestResult,
  validateProviderEndpoint,
} from '../../connection-tester';
import type {
  OpenRouterAdapterOptions,
  OpenRouterChatResponsePayload,
  OpenRouterApiErrorResponse,
} from './openrouter.types';
import {
  mapNormalizedRequestToOpenRouter,
  mapOpenRouterResponseToNormalized,
  mapOpenRouterHttpError,
  sanitizeErrorMessage,
} from './openrouter-mapper';

export class OpenRouterProviderAdapter implements AiProviderAdapter {
  public readonly id = 'openrouter' as const;

  private readonly credentialService: ProviderCredentialService;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly siteUrl: string;
  private readonly siteTitle: string;

  constructor(options?: OpenRouterAdapterOptions) {
    this.credentialService = options?.credentialService ?? new ProviderCredentialService();
    this.fetchFn = options?.fetchFn ?? fetch;
    this.baseUrl = (options?.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? 30000;
    this.siteUrl = options?.siteUrl ?? 'https://verityscout.local';
    this.siteTitle = options?.siteTitle ?? 'VerityScout AI';
  }

  public getMetadata(): ProviderMetadata {
    const base = BASELINE_PROVIDER_METADATA.openrouter;
    return {
      ...base,
      integrationStatus: 'ADAPTER_IMPLEMENTED',
    };
  }

  public getCapabilities(): ProviderCapabilities {
    return this.getMetadata().defaultCapabilities;
  }

  /**
   * Executes lightweight connection validation against OpenRouter's /auth/key endpoint.
   */
  public async testConnection(
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<ConnectionTestResult>> {
    const startTime = Date.now();
    try {
      const result = await testProviderConnection(context.userId, 'openrouter', {
        credentialService: this.credentialService,
        fetchFn: this.fetchFn,
      });
      const latencyMs = Math.max(0, Date.now() - startTime);

      if (result.success) {
        return createSuccessResult(result, latencyMs);
      }

      return createErrorResult(
        createProviderError({
          code: result.code === 'AUTH_FAILED' ? 'AUTH_FAILED' : 'PROVIDER_UNAVAILABLE',
          message: result.message,
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        latencyMs
      );
    } catch (err) {
      const latencyMs = Math.max(0, Date.now() - startTime);
      return createErrorResult(
        createProviderError({
          code: 'UNKNOWN_PROVIDER_ERROR',
          message: sanitizeErrorMessage(err instanceof Error ? err.message : 'Connection test failure'),
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        latencyMs
      );
    }
  }

  /**
   * Lists available models from OpenRouter's /models endpoint.
   */
  public async listModels(
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<readonly ModelDefinition[]>> {
    const startTime = Date.now();
    try {
      const apiKey = await this.credentialService.getDecryptedCredential(context.userId, 'openrouter');
      if (!apiKey) {
        return createErrorResult(
          createProviderError({
            code: 'MISSING_CREDENTIAL',
            message: 'No API credential configured for OpenRouter. Please add your API key in Settings > AI Providers.',
            providerId: 'openrouter',
            correlationId: context.correlationId,
          }),
          0
        );
      }

      const targetUrl = `${this.baseUrl}/models`;
      validateProviderEndpoint('openrouter', targetUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('Timeout listing models')), this.timeoutMs);
      if (context.abortSignal) {
        if (context.abortSignal.aborted) {
          controller.abort(context.abortSignal.reason);
        } else {
          context.abortSignal.addEventListener('abort', () => controller.abort(context.abortSignal?.reason), {
            once: true,
          });
        }
      }

      try {
        const response = await this.fetchFn(targetUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'HTTP-Referer': this.siteUrl,
            'X-Title': this.siteTitle,
            'User-Agent': 'VerityScout-AI/0.1.0',
          },
          signal: controller.signal,
          redirect: 'manual',
        });

        const latencyMs = Math.max(0, Date.now() - startTime);

        if (!response.ok) {
          let errBody: OpenRouterApiErrorResponse | null = null;
          try {
            errBody = (await response.json()) as OpenRouterApiErrorResponse;
          } catch {
            // non-json response
          }
          return createErrorResult(mapOpenRouterHttpError(response.status, errBody, context.correlationId), latencyMs);
        }

        const data = (await response.json()) as { data?: Array<{ id: string; name?: string; description?: string }> };
        const rawList = Array.isArray(data?.data) ? data.data : [];

        const models: ModelDefinition[] = rawList.map((item) => ({
          reference: createModelReference('openrouter', item.id),
          name: item.name ?? item.id,
          capabilities: this.getCapabilities(),
          lastVerifiedAt: new Date().toISOString(),
        }));

        return createSuccessResult(models, latencyMs);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const latencyMs = Math.max(0, Date.now() - startTime);
      return createErrorResult(this.handleUnexpectedError(err, context), latencyMs);
    }
  }

  /**
   * Generates text using OpenRouter's Chat Completions endpoint (POST /api/v1/chat/completions).
   */
  public async generateText(
    request: NormalizedInferenceRequest,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<NormalizedInferenceResponse>> {
    const startTime = Date.now();

    // 1. Contract & Provider Validation
    try {
      validateInferenceRequest(request);
      if (request.modelRef.providerId !== 'openrouter') {
        throw new Error(
          `OpenRouterProviderAdapter received mismatched provider ID "${request.modelRef.providerId}". Expected "openrouter"`
        );
      }
    } catch (validationErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_REQUEST',
          message: sanitizeErrorMessage(
            validationErr instanceof Error ? validationErr.message : 'Invalid request parameters'
          ),
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 2. Authorized Credential Access
    let apiKey: string | null = null;
    try {
      apiKey = await this.credentialService.getDecryptedCredential(context.userId, 'openrouter');
    } catch {
      return createErrorResult(
        createProviderError({
          code: 'AUTH_FAILED',
          message: 'Failed to access decrypted OpenRouter credential from secure vault.',
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    if (!apiKey) {
      return createErrorResult(
        createProviderError({
          code: 'MISSING_CREDENTIAL',
          message: 'No API credential configured for OpenRouter. Please add your API key in Settings > AI Providers.',
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 3. Request Translation to OpenRouter Chat Completions Payload
    let payload;
    try {
      payload = mapNormalizedRequestToOpenRouter(request);
    } catch (mapErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_REQUEST',
          message: sanitizeErrorMessage(mapErr instanceof Error ? mapErr.message : 'Request mapping failed'),
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 4. Endpoint Destination & SSRF Verification
    const targetUrl = `${this.baseUrl}/chat/completions`;
    try {
      validateProviderEndpoint('openrouter', targetUrl);
    } catch (endpointErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_PROVIDER_CONFIG',
          message: sanitizeErrorMessage(
            endpointErr instanceof Error ? endpointErr.message : 'Invalid endpoint configuration'
          ),
          providerId: 'openrouter',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 5. Timeout & Cancellation Setup
    const controller = new AbortController();
    let isTimeout = false;
    const timeoutId = setTimeout(() => {
      isTimeout = true;
      controller.abort(new Error('OpenRouter request timed out after 30s threshold'));
    }, this.timeoutMs);

    if (context.abortSignal) {
      if (context.abortSignal.aborted) {
        clearTimeout(timeoutId);
        return createErrorResult(
          createProviderError({
            code: 'CANCELLED',
            message: 'Inference operation was cancelled by caller before dispatch.',
            providerId: 'openrouter',
            correlationId: context.correlationId,
          }),
          0
        );
      }
      context.abortSignal.addEventListener('abort', () => controller.abort(context.abortSignal?.reason), {
        once: true,
      });
    }

    // 6. Network Dispatch
    try {
      const response = await this.fetchFn(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'HTTP-Referer': this.siteUrl,
          'X-Title': this.siteTitle,
          'User-Agent': 'VerityScout-AI/0.1.0 (Evidence-Synthesis)',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'manual', // Strict: prevent credential transmission across 3xx redirects
      });

      const latencyMs = Math.max(0, Date.now() - startTime);

      if (!response.ok) {
        let errData: OpenRouterApiErrorResponse | null = null;
        try {
          errData = (await response.json()) as OpenRouterApiErrorResponse;
        } catch {
          // Non-JSON or empty error body
        }
        return createErrorResult(mapOpenRouterHttpError(response.status, errData, context.correlationId), latencyMs);
      }

      // 7. Parse & Normalize Successful Response
      const rawJson = (await response.json()) as OpenRouterChatResponsePayload;
      const normalized = mapOpenRouterResponseToNormalized(rawJson, request.modelRef, latencyMs);

      return createSuccessResult(normalized, latencyMs);
    } catch (networkErr: unknown) {
      const latencyMs = Math.max(0, Date.now() - startTime);

      if (isTimeout) {
        return createErrorResult(
          createProviderError({
            code: 'TIMEOUT',
            message: 'OpenRouter inference request timed out.',
            providerId: 'openrouter',
            correlationId: context.correlationId,
          }),
          latencyMs
        );
      }

      if (context.abortSignal?.aborted) {
        return createErrorResult(
          createProviderError({
            code: 'CANCELLED',
            message: 'OpenRouter inference request was cancelled by caller.',
            providerId: 'openrouter',
            correlationId: context.correlationId,
          }),
          latencyMs
        );
      }

      return createErrorResult(this.handleUnexpectedError(networkErr, context), latencyMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private handleUnexpectedError(err: unknown, context: ProviderOperationContext) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitized = sanitizeErrorMessage(rawMessage);

    return createProviderError({
      code: 'NETWORK_ERROR',
      message: sanitized,
      providerId: 'openrouter',
      correlationId: context.correlationId,
    });
  }
}
