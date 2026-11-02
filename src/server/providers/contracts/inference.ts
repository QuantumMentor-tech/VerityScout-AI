/**
 * VerityScout AI — Normalized Inference Contracts
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Normalized requests abstract away vendor-specific wire formats (OpenAI, OpenRouter, NIM).
 * 2. Strict validation prevents malformed payloads from reaching provider network boundaries.
 * 3. Never expose vendor-native raw responses in public contracts.
 */

import type { ModelReference } from './model';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface NormalizedMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
}

export type ResponseFormatType = 'text' | 'json_object' | 'json_schema';

export interface ResponseFormatSpec {
  readonly type: ResponseFormatType;
  readonly schema?: Record<string, unknown>;
  readonly schemaName?: string;
}

export interface NormalizedInferenceRequest {
  readonly modelRef: ModelReference;
  readonly messages: readonly NormalizedMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: ResponseFormatSpec;
  readonly stopSequences?: readonly string[];
  readonly abortSignal?: AbortSignal;
  readonly correlationId?: string;
}

export type FinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'abort'
  | 'error'
  | 'unknown';

export interface InferenceUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

export interface NormalizedInferenceResponse {
  readonly text: string;
  readonly finishReason: FinishReason;
  readonly usage?: InferenceUsage;
  readonly modelRef: ModelReference;
  readonly rawFinishReason?: string;
  readonly latencyMs: number;
  readonly completedAt: string;
}

/**
 * Validates a NormalizedInferenceRequest, asserting correctness before invoking an adapter.
 */
export function validateInferenceRequest(request: NormalizedInferenceRequest): void {
  if (!request.modelRef || !request.modelRef.providerId || !request.modelRef.modelId) {
    throw new Error('Inference request must specify a valid modelRef (providerId and modelId)');
  }

  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error('Inference request must contain at least one message');
  }

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];
    if (!msg || typeof msg.content !== 'string' || msg.content.trim().length === 0) {
      throw new Error(`Message at index ${i} has empty or non-string content`);
    }
    if (!['system', 'user', 'assistant', 'tool'].includes(msg.role)) {
      throw new Error(`Message at index ${i} has unsupported role "${String(msg.role)}"`);
    }
  }

  if (request.temperature !== undefined) {
    if (typeof request.temperature !== 'number' || isNaN(request.temperature)) {
      throw new Error('Temperature must be a valid number');
    }
    if (request.temperature < 0.0 || request.temperature > 2.0) {
      throw new Error(`Temperature must be between 0.0 and 2.0. Received: ${request.temperature}`);
    }
  }

  if (request.maxTokens !== undefined) {
    if (!Number.isInteger(request.maxTokens) || request.maxTokens <= 0) {
      throw new Error(`Max tokens must be a positive integer. Received: ${request.maxTokens}`);
    }
  }
}
