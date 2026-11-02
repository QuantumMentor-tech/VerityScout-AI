import 'server-only';

/**
 * VerityScout AI — OpenAI Request & Response Mapper
 * Governed by: Step 28 (OpenAI Provider Adapter, Request/Response Mapping, Error Normalization, and Integration Tests)
 *
 * Primary Architectural Rule:
 * Pure mapping functions translating between VerityScout AI's normalized contracts
 * and OpenAI's Responses API wire formats with rigorous secret sanitization.
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
  OpenAiMessage,
  OpenAiResponsesRequestPayload,
  OpenAiResponsesResponsePayload,
  OpenAiApiErrorResponse,
} from './openai.types';

/**
 * Redacts API keys and Bearer tokens from raw strings to prevent secret leakage in logs/errors.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]')
    .replace(/nvapi-[a-zA-Z0-9_-]{12,}/g, '[REDACTED_API_KEY]');
}

/**
 * Maps a NormalizedInferenceRequest into an OpenAI Responses API payload.
 */
export function mapNormalizedRequestToOpenAiResponses(
  request: NormalizedInferenceRequest
): OpenAiResponsesRequestPayload {
  const inputMessages: OpenAiMessage[] = [];

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

  const payload: {
    model: string;
    input: readonly OpenAiMessage[];
    temperature?: number;
    max_output_tokens?: number;
    response_format?: { type: 'text' | 'json_object' };
    stop?: readonly string[];
  } = {
    model: request.modelRef.modelId,
    input: inputMessages,
  };

  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }

  if (request.maxTokens !== undefined) {
    payload.max_output_tokens = request.maxTokens;
  }

  if (request.responseFormat) {
    if (request.responseFormat.type === 'json_object' || request.responseFormat.type === 'json_schema') {
      payload.response_format = { type: 'json_object' };
    } else {
      payload.response_format = { type: 'text' };
    }
  }

  if (request.stopSequences && request.stopSequences.length > 0) {
    payload.stop = [...request.stopSequences];
  }

  return payload;
}

/**
 * Maps an OpenAI Responses API response payload into a NormalizedInferenceResponse.
 */
export function mapOpenAiResponsesToNormalized(
  payload: OpenAiResponsesResponsePayload,
  modelRef: ModelReference,
  latencyMs: number
): NormalizedInferenceResponse {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Received empty or non-object response from OpenAI Responses API');
  }

  if (payload.status === 'failed') {
    const errCode = payload.error?.code ?? 'response_failed';
    const errMsg = payload.error?.message ?? 'OpenAI generation marked as failed';
    throw new Error(`OpenAI response status is "failed" (${errCode}): ${sanitizeErrorMessage(errMsg)}`);
  }

  const textSegments: string[] = [];
  let isRefusal = false;
  let refusalMessage = '';

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item && item.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'output_text' && typeof part.text === 'string') {
            textSegments.push(part.text);
          } else if (part.type === 'refusal' && typeof part.refusal === 'string') {
            isRefusal = true;
            refusalMessage = part.refusal;
          }
        }
      }
    }
  }

  let finishReason: FinishReason = 'stop';
  let rawFinishReason: string = payload.status;

  if (isRefusal) {
    finishReason = 'content_filter';
    rawFinishReason = 'refusal';
  } else if (payload.status === 'incomplete') {
    const reason = payload.incomplete_details?.reason;
    rawFinishReason = `incomplete:${reason ?? 'unknown'}`;
    if (reason === 'max_output_tokens') {
      finishReason = 'length';
    } else if (reason === 'content_filter') {
      finishReason = 'content_filter';
    } else {
      finishReason = 'length';
    }
  } else if (payload.status === 'completed') {
    finishReason = 'stop';
  } else {
    finishReason = 'unknown';
  }

  let usage: InferenceUsage | undefined;
  if (payload.usage && typeof payload.usage === 'object') {
    usage = {
      ...(payload.usage.input_tokens !== undefined ? { promptTokens: payload.usage.input_tokens } : {}),
      ...(payload.usage.output_tokens !== undefined ? { completionTokens: payload.usage.output_tokens } : {}),
      ...(payload.usage.total_tokens !== undefined ? { totalTokens: payload.usage.total_tokens } : {}),
    };
  }

  const extractedText = isRefusal ? refusalMessage : textSegments.join('');

  return {
    text: extractedText,
    finishReason,
    ...(usage ? { usage } : {}),
    modelRef,
    rawFinishReason,
    latencyMs: Math.max(0, latencyMs),
    completedAt: new Date().toISOString(),
  };
}

/**
 * Maps an HTTP failure response from OpenAI into a classified, sanitized ProviderError.
 */
export function mapOpenAiHttpError(
  status: number,
  errorData: OpenAiApiErrorResponse | null,
  correlationId?: string
): ProviderError {
  const rawMsg = errorData?.error?.message ?? `OpenAI API returned HTTP ${status}`;
  const sanitizedMsg = sanitizeErrorMessage(rawMsg);
  const errorCode = errorData?.error?.code ?? null;

  let code: ProviderErrorCode;

  if (status === 401 || errorCode === 'invalid_api_key') {
    code = 'AUTH_FAILED';
  } else if (status === 403) {
    code = 'PERMISSION_DENIED';
  } else if (status === 404 || errorCode === 'model_not_found') {
    code = 'MODEL_UNAVAILABLE';
  } else if (
    status === 429 ||
    errorCode === 'insufficient_quota' ||
    errorCode === 'rate_limit_exceeded'
  ) {
    code = 'RATE_LIMITED';
  } else if (status >= 500) {
    code = 'PROVIDER_UNAVAILABLE';
  } else if (status === 400) {
    code = 'INVALID_REQUEST';
  } else {
    code = 'UNKNOWN_PROVIDER_ERROR';
  }

  return createProviderError({
    code,
    message: sanitizedMsg,
    providerId: 'openai',
    httpStatus: status,
    ...(correlationId ? { correlationId } : {}),
    ...(errorCode ? { internalDiagnosticCode: errorCode } : {}),
  });
}
