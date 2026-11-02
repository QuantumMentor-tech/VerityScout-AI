import 'server-only';

/**
 * VerityScout AI — OpenRouter Provider Wire Types & Configuration
 * Governed by: Step 29 (OpenRouter Provider Adapter, Model Identifier Mapping, Request/Response Normalization, Error Handling, and Integration Tests)
 *
 * Official References:
 * - OpenRouter API Overview: https://openrouter.ai/docs/api-reference/overview
 * - Authentication: https://openrouter.ai/docs/api-reference/authentication
 * - Chat Completions: https://openrouter.ai/docs/api/api-reference/chat/create-chat-completion
 * - Error Handling & Limits: https://openrouter.ai/docs/api-reference/errors-and-debugging
 * - Model Listing: https://openrouter.ai/docs/api/api-reference/models/get-models
 */

import type { ProviderCredentialService } from '@/server/services/provider-credential.service';

export interface OpenRouterMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface OpenRouterResponseFormat {
  readonly type: 'json_object';
}

/**
 * Request payload for OpenRouter Chat Completions API (POST /api/v1/chat/completions)
 */
export interface OpenRouterChatRequestPayload {
  readonly model: string;
  readonly messages: readonly OpenRouterMessage[];
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly response_format?: OpenRouterResponseFormat;
  readonly stop?: readonly string[];
}

export interface OpenRouterChoiceMessage {
  readonly role: 'assistant';
  readonly content: string | null;
  readonly refusal?: string | null;
}

export interface OpenRouterChoice {
  readonly index: number;
  readonly message: OpenRouterChoiceMessage;
  readonly finish_reason: string | null;
}

export interface OpenRouterUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

/**
 * Response payload from OpenRouter Chat Completions API
 */
export interface OpenRouterChatResponsePayload {
  readonly id: string;
  readonly provider?: string;
  readonly model?: string;
  readonly object?: string;
  readonly created?: number;
  readonly choices?: readonly OpenRouterChoice[];
  readonly usage?: OpenRouterUsage;
}

export interface OpenRouterErrorMetadata {
  readonly error_type?: string;
  readonly provider_name?: string;
  readonly raw?: unknown;
  readonly [key: string]: unknown;
}

export interface OpenRouterApiErrorPayload {
  readonly message?: string;
  readonly code?: number | string;
  readonly metadata?: OpenRouterErrorMetadata;
}

/**
 * Error response body from OpenRouter
 */
export interface OpenRouterApiErrorResponse {
  readonly error?: OpenRouterApiErrorPayload;
}

/**
 * Configuration options for OpenRouterProviderAdapter
 */
export interface OpenRouterAdapterOptions {
  readonly credentialService?: ProviderCredentialService;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly siteUrl?: string;
  readonly siteTitle?: string;
}
