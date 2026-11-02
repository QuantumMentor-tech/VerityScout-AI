import 'server-only';

/**
 * VerityScout AI — OpenAI Provider Wire Types & Configuration
 * Governed by: Step 28 (OpenAI Provider Adapter, Request/Response Mapping, Error Normalization, and Integration Tests)
 *
 * Official Reference:
 * - OpenAI API Documentation: https://developers.openai.com/api/docs/
 * - Responses API Reference: https://developers.openai.com/api/docs/guides/migrate-to-responses
 * - Error Codes Guide: https://developers.openai.com/api/docs/guides/error-codes
 */

import type { ProviderCredentialService } from '@/server/services/provider-credential.service';

export interface OpenAiMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OpenAiResponseFormat {
  readonly type: 'text' | 'json_object';
}

/**
 * Request payload for OpenAI Responses API (POST /v1/responses)
 */
export interface OpenAiResponsesRequestPayload {
  readonly model: string;
  readonly input: readonly OpenAiMessage[];
  readonly temperature?: number;
  readonly max_output_tokens?: number;
  readonly response_format?: OpenAiResponseFormat;
  readonly stop?: readonly string[];
}

export interface OpenAiOutputTextContent {
  readonly type: 'output_text';
  readonly text: string;
}

export interface OpenAiOutputRefusalContent {
  readonly type: 'refusal';
  readonly refusal: string;
}

export type OpenAiOutputItemContent = OpenAiOutputTextContent | OpenAiOutputRefusalContent;

export interface OpenAiOutputMessageItem {
  readonly type: 'message';
  readonly role: 'assistant';
  readonly content: readonly OpenAiOutputItemContent[];
}

export type OpenAiOutputItem = OpenAiOutputMessageItem | { readonly type: string; readonly [key: string]: unknown };

export interface OpenAiResponsesUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly total_tokens?: number;
}

/**
 * Response payload from OpenAI Responses API (POST /v1/responses)
 */
export interface OpenAiResponsesResponsePayload {
  readonly id: string;
  readonly object: string;
  readonly created_at?: number;
  readonly model?: string;
  readonly status: 'completed' | 'in_progress' | 'incomplete' | 'failed';
  readonly output?: readonly OpenAiOutputItem[];
  readonly incomplete_details?: {
    readonly reason?: 'max_output_tokens' | 'content_filter' | string;
  };
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
  readonly usage?: OpenAiResponsesUsage;
}

/**
 * Standard OpenAI error JSON body returned on 4xx/5xx responses
 */
export interface OpenAiApiErrorResponse {
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly param?: string | null;
    readonly code?: string | null;
  };
}

/**
 * Configuration options for OpenAiProviderAdapter
 */
export interface OpenAiAdapterOptions {
  readonly credentialService?: ProviderCredentialService;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}
