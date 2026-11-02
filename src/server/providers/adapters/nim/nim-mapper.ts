import 'server-only';

/**
 * VerityScout AI — NVIDIA NIM Request & Response Mapper
 * Governed by: Step 30 (NVIDIA NIM Provider Adapter, Request/Response Mapping, Error Normalization, and Integration Tests)
 *
 * Primary Architectural Rules:
 * 1. Pure mapping functions between VerityScout AI contracts and NVIDIA NIM Chat Completions API.
 * 2. Preserves publisher-qualified model IDs (e.g. "meta/llama-3.1-70b-instruct", "nvidia/nemotron-4-340b-instruct").
 * 3. Normalizes HTTP and provider failure modes into shared provider error taxonomy.
 * 4. Rigorous secret sanitization scrubbing all NVIDIA, OpenRouter, and OpenAI key patterns.
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
  NimMessage,
  NimChatRequestPayload,
  NimChatResponsePayload,
  NimApiErrorResponse,
} from './nim.types';

/**
 * Redacts NVIDIA keys (nvapi-...), OpenRouter keys, OpenAI keys, and Bearer tokens from raw strings.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-or-v1-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}

/**
 * Maps a NormalizedInferenceRequest into an NVIDIA NIM Chat Completions request payload.
 * Preserves publisher-qualified model references (e.g. "meta/llama-3.1-70b-instruct").
 */
export function mapNormalizedRequestToNim(
  request: NormalizedInferenceRequest
): NimChatRequestPayload {
  const inputMessages: NimMessage[] = [];

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
    throw new Error('NVIDIA NIM model reference cannot be empty');
  }

  const payload: {
    model: string;
    messages: readonly NimMessage[];
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
 * Maps an NVIDIA NIM Chat Completions response payload into a NormalizedInferenceResponse.
 */
export function mapNimResponseToNormalized(
  payload: NimChatResponsePayload,
  modelRef: ModelReference,
  latencyMs: number
): NormalizedInferenceResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Received empty or non-object response from NVIDIA NIM');
  }

  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error('NVIDIA NIM response contains empty or missing choices array');
  }

  const primaryChoice = payload.choices[0];
  if (!primaryChoice) {
    throw new Error('NVIDIA NIM response primary choice is missing');
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
 * Maps an HTTP failure from NVIDIA NIM into a classified, sanitized ProviderError.
 */
export function mapNimHttpError(
  status: number,
  errorData: NimApiErrorResponse | null,
  correlationId?: string
): ProviderError {
  let rawMsg = '';

  if (errorData?.error?.message) {
    rawMsg = errorData.error.message;
  } else if (typeof errorData?.detail === 'string') {
    rawMsg = errorData.detail;
  } else if (Array.isArray(errorData?.detail)) {
    rawMsg = errorData.detail.map((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item))).join('; ');
  } else if (errorData?.message) {
    rawMsg = errorData.message;
  } else {
    rawMsg = `NVIDIA NIM API returned HTTP ${status}`;
  }

  const sanitizedMsg = sanitizeErrorMessage(rawMsg);
  const errorCode = String(errorData?.error?.code ?? '');
  const lowerMsg = sanitizedMsg.toLowerCase();

  let code: ProviderErrorCode;
  let isRetryable = false;

  if (
    status === 401 ||
    errorCode === '401' ||
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid token')
  ) {
    code = 'AUTH_FAILED';
    isRetryable = false;
  } else if (
    status === 403 ||
    errorCode === '403' ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('access denied')
  ) {
    code = 'PERMISSION_DENIED';
    isRetryable = false;
  } else if (
    status === 404 ||
    errorCode === '404' ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('model not found') ||
    lowerMsg.includes('does not exist')
  ) {
    code = 'MODEL_UNAVAILABLE';
    isRetryable = false;
  } else if (
    status === 429 ||
    errorCode === '429' ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('too many requests')
  ) {
    code = 'RATE_LIMITED';
    isRetryable = true;
  } else if (status >= 500) {
    code = 'PROVIDER_UNAVAILABLE';
    isRetryable = true;
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
    providerId: 'nim',
    httpStatus: status,
    isRetryableOverride: isRetryable,
    ...(correlationId ? { correlationId } : {}),
  });
}
