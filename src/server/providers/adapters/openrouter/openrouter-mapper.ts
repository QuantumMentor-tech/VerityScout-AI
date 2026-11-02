import 'server-only';

/**
 * VerityScout AI — OpenRouter Request & Response Mapper
 * Governed by: Step 29 (OpenRouter Provider Adapter, Model Identifier Mapping, Request/Response Normalization, Error Handling, and Integration Tests)
 *
 * Primary Architectural Rules:
 * 1. Pure mapping functions between VerityScout AI contracts and OpenRouter Chat Completions API.
 * 2. Preserves publisher-qualified model IDs (e.g. "anthropic/claude-3.5-sonnet").
 * 3. Distinguishes credit exhaustion (HTTP 402) from platform/upstream rate limits (HTTP 429).
 * 4. Rigorous secret sanitization scrubbing all OpenRouter and OpenAI key patterns.
 */

import type { ModelReference } from '../../contracts/model';
import type {
  NormalizedInferenceRequest,
  NormalizedInferenceResponse,
  FinishReason,
  InferenceUsage,
} from '../../contracts/inference';
import {
  type ProviderError,
  type ProviderErrorCode,
  createProviderError,
} from '../../contracts/operation-result';
import type {
  OpenRouterMessage,
  OpenRouterChatRequestPayload,
  OpenRouterChatResponsePayload,
  OpenRouterApiErrorResponse,
} from './openrouter.types';

/**
 * Redacts OpenRouter keys, OpenAI keys, and Bearer tokens from raw strings.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/nvapi-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}

/**
 * Maps a NormalizedInferenceRequest into an OpenRouter Chat Completions request payload.
 * Strictly preserves publisher-qualified model references (e.g. "meta-llama/llama-3.1-70b-instruct").
 */
export function mapNormalizedRequestToOpenRouter(
  request: NormalizedInferenceRequest
): OpenRouterChatRequestPayload {
  const inputMessages: OpenRouterMessage[] = [];

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];
    if (!msg) continue;
    if (msg.role === 'tool') {
      throw new Error(`Tool messages are not supported in MVP text generation (index ${i})`);
    }
    inputMessages.push({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    });
  }

  const modelId = request.modelRef.modelId.trim();
  if (!modelId) {
    throw new Error('OpenRouter model reference cannot be empty');
  }

  const payload: {
    model: string;
    messages: readonly OpenRouterMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' };
    stop?: readonly string[];
  } = {
    model: modelId,
    messages: inputMessages,
  };

  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }

  if (request.maxTokens !== undefined) {
    payload.max_tokens = request.maxTokens;
  }

  if (request.responseFormat) {
    if (request.responseFormat.type === 'json_object' || request.responseFormat.type === 'json_schema') {
      payload.response_format = { type: 'json_object' };
    }
  }

  if (request.stopSequences && request.stopSequences.length > 0) {
    payload.stop = [...request.stopSequences];
  }

  return payload;
}

/**
 * Maps an OpenRouter Chat Completions response payload into a NormalizedInferenceResponse.
 */
export function mapOpenRouterResponseToNormalized(
  payload: OpenRouterChatResponsePayload,
  modelRef: ModelReference,
  latencyMs: number
): NormalizedInferenceResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Received empty or non-object response from OpenRouter');
  }

  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error('OpenRouter response contains empty or missing choices array');
  }

  const primaryChoice = payload.choices[0];
  if (!primaryChoice) {
    throw new Error('OpenRouter response primary choice is missing');
  }

  let text = '';
  let finishReason: FinishReason = 'stop';
  let rawFinishReason: string = primaryChoice.finish_reason ?? 'stop';

  if (primaryChoice.message) {
    if (primaryChoice.message.refusal) {
      text = primaryChoice.message.refusal;
      finishReason = 'content_filter';
      rawFinishReason = 'refusal';
    } else if (typeof primaryChoice.message.content === 'string') {
      text = primaryChoice.message.content;
    }
  }

  if (finishReason !== 'content_filter') {
    switch (primaryChoice.finish_reason) {
      case 'stop':
        finishReason = 'stop';
        break;
      case 'length':
        finishReason = 'length';
        break;
      case 'content_filter':
        finishReason = 'content_filter';
        break;
      default:
        finishReason = 'unknown';
        break;
    }
  }

  // Preserve upstream serving provider metadata if reported by gateway (e.g. "Anthropic")
  if (payload.provider) {
    rawFinishReason = `${rawFinishReason};upstream:${payload.provider}`;
  }

  let usage: InferenceUsage | undefined;
  if (payload.usage && typeof payload.usage === 'object') {
    usage = {
      ...(payload.usage.prompt_tokens !== undefined ? { promptTokens: payload.usage.prompt_tokens } : {}),
      ...(payload.usage.completion_tokens !== undefined ? { completionTokens: payload.usage.completion_tokens } : {}),
      ...(payload.usage.total_tokens !== undefined ? { totalTokens: payload.usage.total_tokens } : {}),
    };
  }

  return {
    text,
    finishReason,
    ...(usage ? { usage } : {}),
    modelRef,
    rawFinishReason,
    latencyMs: Math.max(0, latencyMs),
    completedAt: new Date().toISOString(),
  };
}

/**
 * Maps an HTTP failure from OpenRouter into a classified, sanitized ProviderError.
 * Distinguishes credit exhaustion (402) from platform and upstream rate limits (429).
 */
export function mapOpenRouterHttpError(
  status: number,
  errorData: OpenRouterApiErrorResponse | null,
  correlationId?: string
): ProviderError {
  const rawMsg = errorData?.error?.message ?? `OpenRouter API returned HTTP ${status}`;
  const sanitizedMsg = sanitizeErrorMessage(rawMsg);
  const metadata = errorData?.error?.metadata;
  const errorType = metadata?.error_type ?? '';
  const providerName = metadata?.provider_name ?? '';
  const errorCode = String(errorData?.error?.code ?? '');

  let code: ProviderErrorCode;
  let isRetryable = false;
  let internalDiagnosticCode: string | undefined;

  if (status === 401 || errorCode === '401' || sanitizedMsg.toLowerCase().includes('invalid api key')) {
    code = 'AUTH_FAILED';
    isRetryable = false;
  } else if (
    status === 402 ||
    errorCode === '402' ||
    errorType === 'insufficient_credits' ||
    errorType === 'key_limit_reached' ||
    sanitizedMsg.toLowerCase().includes('insufficient credits') ||
    sanitizedMsg.toLowerCase().includes('credit limit')
  ) {
    // Distinct Credit / Spending-Limit Failure (non-retryable without refilling balance)
    code = 'INSUFFICIENT_CREDITS';
    isRetryable = false;
    internalDiagnosticCode = 'insufficient_credits';
  } else if (status === 403) {
    code = 'PERMISSION_DENIED';
    isRetryable = false;
  } else if (status === 404 || errorType === 'model_not_found' || sanitizedMsg.toLowerCase().includes('not found')) {
    code = 'MODEL_UNAVAILABLE';
    isRetryable = false;
  } else if (status === 429) {
    code = 'RATE_LIMITED';
    isRetryable = true;
    if (errorType === 'provider_rate_limit' || errorType === 'provider_capacity') {
      internalDiagnosticCode = providerName ? `upstream:${providerName}` : 'upstream_rate_limit';
    } else {
      internalDiagnosticCode = 'platform_rate_limit';
    }
  } else if (status >= 500) {
    code = 'PROVIDER_UNAVAILABLE';
    isRetryable = true;
    if (providerName) {
      internalDiagnosticCode = `upstream_failure:${providerName}`;
    }
  } else if (status === 400) {
    code = 'INVALID_REQUEST';
    isRetryable = false;
  } else {
    code = 'UNKNOWN_PROVIDER_ERROR';
    isRetryable = false;
  }

  return createProviderError({
    code,
    message: sanitizedMsg,
    providerId: 'openrouter',
    httpStatus: status,
    isRetryableOverride: isRetryable,
    ...(correlationId ? { correlationId } : {}),
    ...(internalDiagnosticCode ? { internalDiagnosticCode } : {}),
  });
}
