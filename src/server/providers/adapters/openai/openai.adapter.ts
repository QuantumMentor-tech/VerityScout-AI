import 'server-only';

/**
 * VerityScout AI — OpenAI Provider Adapter
 * Governed by: Step 28 (OpenAI Provider Adapter, Request/Response Mapping, Error Normalization, and Integration Tests)
 *
 * Primary Architectural Rule:
 * Implements AiProviderAdapter for OpenAI using the official Responses API.
 * Server-only execution boundary with user-scoped credential isolation and zero secret leakage.
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
  OpenAiAdapterOptions,
  OpenAiResponsesResponsePayload,
  OpenAiApiErrorResponse,
} from './openai.types';
import {
  mapNormalizedRequestToOpenAiResponses,
  mapOpenAiResponsesToNormalized,
  mapOpenAiHttpError,
  sanitizeErrorMessage,
} from './openai-mapper';

export class OpenAiProviderAdapter implements AiProviderAdapter {
  public readonly id = 'openai' as const;

  private readonly credentialService: ProviderCredentialService;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: OpenAiAdapterOptions) {
    this.credentialService = options?.credentialService ?? new ProviderCredentialService();
    this.fetchFn = options?.fetchFn ?? fetch;
    this.baseUrl = (options?.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  public getMetadata(): ProviderMetadata {
    const base = BASELINE_PROVIDER_METADATA.openai;
    return {
      ...base,
      integrationStatus: 'ADAPTER_IMPLEMENTED',
    };
  }

  public getCapabilities(): ProviderCapabilities {
    return this.getMetadata().defaultCapabilities;
  }

  /**
   * Executes connection testing against OpenAI's lightweight models endpoint.
   */
  public async testConnection(
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<ConnectionTestResult>> {
    const startTime = Date.now();
    try {
      const result = await testProviderConnection(context.userId, 'openai', {
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
          providerId: 'openai',
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
          providerId: 'openai',
          correlationId: context.correlationId,
        }),
        latencyMs
      );
    }
  }

  /**
   * Lists available models from the OpenAI /v1/models endpoint.
   */
  public async listModels(
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<readonly ModelDefinition[]>> {
    const startTime = Date.now();
    try {
      const apiKey = await this.credentialService.getDecryptedCredential(context.userId, 'openai');
      if (!apiKey) {
        return createErrorResult(
          createProviderError({
            code: 'MISSING_CREDENTIAL',
            message: 'No API credential configured for OpenAI. Please add your API key in Settings > AI Providers.',
            providerId: 'openai',
            correlationId: context.correlationId,
          }),
          0
        );
      }

      const targetUrl = `${this.baseUrl}/models`;
      validateProviderEndpoint('openai', targetUrl);

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
            'User-Agent': 'VerityScout-AI/0.1.0',
          },
          signal: controller.signal,
          redirect: 'manual',
        });

        const latencyMs = Math.max(0, Date.now() - startTime);

        if (!response.ok) {
          let errBody: OpenAiApiErrorResponse | null = null;
          try {
            errBody = (await response.json()) as OpenAiApiErrorResponse;
          } catch {
            // non-json response
          }
          return createErrorResult(mapOpenAiHttpError(response.status, errBody, context.correlationId), latencyMs);
        }

        const data = (await response.json()) as { data?: Array<{ id: string }> };
        const rawList = Array.isArray(data?.data) ? data.data : [];

        const models: ModelDefinition[] = rawList.map((item) => ({
          reference: createModelReference('openai', item.id),
          name: item.id,
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
   * Generates text using OpenAI's Responses API (POST /v1/responses).
   */
  public async generateText(
    request: NormalizedInferenceRequest,
    context: ProviderOperationContext
  ): Promise<ProviderOperationResult<NormalizedInferenceResponse>> {
    const startTime = Date.now();

    // 1. Contract & Provider Validation
    try {
      validateInferenceRequest(request);
      if (request.modelRef.providerId !== 'openai') {
        throw new Error(
          `OpenAiProviderAdapter received mismatched provider ID "${request.modelRef.providerId}". Expected "openai"`
        );
      }
    } catch (validationErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_REQUEST',
          message: sanitizeErrorMessage(
            validationErr instanceof Error ? validationErr.message : 'Invalid request parameters'
          ),
          providerId: 'openai',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 2. Authorized Credential Access
    let apiKey: string | null = null;
    try {
      apiKey = await this.credentialService.getDecryptedCredential(context.userId, 'openai');
    } catch {
      return createErrorResult(
        createProviderError({
          code: 'AUTH_FAILED',
          message: 'Failed to access decrypted credential from secure vault.',
          providerId: 'openai',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    if (!apiKey) {
      return createErrorResult(
        createProviderError({
          code: 'MISSING_CREDENTIAL',
          message: 'No API credential configured for OpenAI. Please add your API key in Settings > AI Providers.',
          providerId: 'openai',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 3. Request Translation to OpenAI Responses API Payload
    let payload;
    try {
      payload = mapNormalizedRequestToOpenAiResponses(request);
    } catch (mapErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_REQUEST',
          message: sanitizeErrorMessage(mapErr instanceof Error ? mapErr.message : 'Request mapping failed'),
          providerId: 'openai',
          correlationId: context.correlationId,
        }),
        0
      );
    }

    // 4. Endpoint & Security Enforcement
    const targetUrl = `${this.baseUrl}/responses`;
    try {
      validateProviderEndpoint('openai', targetUrl);
    } catch (endpointErr) {
      return createErrorResult(
        createProviderError({
          code: 'INVALID_PROVIDER_CONFIG',
          message: sanitizeErrorMessage(
            endpointErr instanceof Error ? endpointErr.message : 'Invalid endpoint configuration'
          ),
          providerId: 'openai',
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
      controller.abort(new Error('OpenAI request timed out after 30s threshold'));
    }, this.timeoutMs);

    if (context.abortSignal) {
      if (context.abortSignal.aborted) {
        clearTimeout(timeoutId);
        return createErrorResult(
          createProviderError({
            code: 'CANCELLED',
            message: 'Inference operation was cancelled by caller before dispatch.',
            providerId: 'openai',
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
          'User-Agent': 'VerityScout-AI/0.1.0 (Research-Synthesis)',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        redirect: 'manual', // Strict: prevent credential transmission across 3xx redirects
      });

      const latencyMs = Math.max(0, Date.now() - startTime);

      if (!response.ok) {
        let errData: OpenAiApiErrorResponse | null = null;
        try {
          errData = (await response.json()) as OpenAiApiErrorResponse;
        } catch {
          // Non-JSON or empty error body
        }
        return createErrorResult(mapOpenAiHttpError(response.status, errData, context.correlationId), latencyMs);
      }

      // 7. Parse & Normalize Successful Response
      const rawJson = (await response.json()) as OpenAiResponsesResponsePayload;
      const normalized = mapOpenAiResponsesToNormalized(rawJson, request.modelRef, latencyMs);

      return createSuccessResult(normalized, latencyMs);
    } catch (networkErr: unknown) {
      const latencyMs = Math.max(0, Date.now() - startTime);

      if (isTimeout) {
        return createErrorResult(
          createProviderError({
            code: 'TIMEOUT',
            message: 'OpenAI inference request timed out.',
            providerId: 'openai',
            correlationId: context.correlationId,
          }),
          latencyMs
        );
      }

      if (context.abortSignal?.aborted) {
        return createErrorResult(
          createProviderError({
            code: 'CANCELLED',
            message: 'OpenAI inference request was cancelled by caller.',
            providerId: 'openai',
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
      providerId: 'openai',
      correlationId: context.correlationId,
    });
  }
}
