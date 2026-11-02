import 'server-only';

/**
 * VerityScout AI — NVIDIA NIM Provider Wire Types & Configuration
 * Governed by: Step 30 (NVIDIA NIM Provider Adapter, Request/Response Mapping, Error Normalization, and Integration Tests)
 *
 * Official References:
 * - NVIDIA Hosted NIM LLM API Reference: https://docs.api.nvidia.com/nim/reference/llm-apis
 * - NVIDIA NIM LLM & VLM API Reference: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
 * - NVIDIA NIM Tutorials & Quickstart: https://docs.nvidia.com/nim/large-language-models/latest/tutorials.html
 * - NVIDIA NIM Supported Models: https://docs.nvidia.com/nim/large-language-models/latest/supported-models.html
 * - NVIDIA NIM Introduction: https://docs.nvidia.com/nim/large-language-models/latest/introduction.html
 *
 * Approved Deployment Model:
 * - Hosted API: https://integrate.api.nvidia.com/v1
 * - Chat Completions: POST https://integrate.api.nvidia.com/v1/chat/completions
 * - Model Listing: GET https://integrate.api.nvidia.com/v1/models
 * - Authentication: Authorization: Bearer nvapi-...
 */

import type { ProviderCredentialService } from '@/server/services/provider-credential.service';

export interface NimMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface NimResponseFormat {
  readonly type: 'json_object';
}

/**
 * Request payload for NVIDIA NIM Chat Completions API (POST /v1/chat/completions)
 */
export interface NimChatRequestPayload {
  readonly model: string;
  readonly messages: readonly NimMessage[];
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly top_p?: number;
  readonly response_format?: NimResponseFormat;
  readonly stop?: readonly string[];
  readonly stream?: boolean;
}

export interface NimChoiceMessage {
  readonly role: 'assistant';
  readonly content: string | null;
  readonly refusal?: string | null;
}

export interface NimChoice {
  readonly index: number;
  readonly message: NimChoiceMessage;
  readonly finish_reason: string | null;
}

export interface NimUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

/**
 * Response payload from NVIDIA NIM Chat Completions API
 */
export interface NimChatResponsePayload {
  readonly id: string;
  readonly object?: string;
  readonly created?: number;
  readonly model?: string;
  readonly choices?: readonly NimChoice[];
  readonly usage?: NimUsage;
}

export interface NimApiErrorPayload {
  readonly message?: string;
  readonly type?: string;
  readonly code?: number | string;
  readonly detail?: string | unknown;
}

/**
 * Error response body from NVIDIA NIM hosted API.
 * NVIDIA NIM can return { error: { message, code } } or { detail: string | array } or { message: string }.
 */
export interface NimApiErrorResponse {
  readonly error?: NimApiErrorPayload;
  readonly detail?: string | readonly unknown[];
  readonly message?: string;
  readonly title?: string;
  readonly status?: number;
}

/**
 * Configuration options for NimProviderAdapter
 */
export interface NimAdapterOptions {
  readonly credentialService?: ProviderCredentialService;
  readonly fetchFn?: typeof fetch;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}
