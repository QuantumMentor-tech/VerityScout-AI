/**
 * VerityScout AI — Provider Metadata Contracts
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Metadata describes what is known about a provider without secrets.
 * 2. Explicit integration status lifecycle: KNOWN, CONTRACT_DEFINED, ADAPTER_IMPLEMENTED, OPERATIONAL, DEPRECATED, BLOCKED.
 * 3. Step 27 defines contracts; adapters are implemented in Steps 28-30.
 */

import type { AiProviderId } from './provider-id';
import { declareCapability, type ProviderCapabilities } from './capabilities';

export type IntegrationStatus =
  | 'KNOWN'
  | 'CONTRACT_DEFINED'
  | 'ADAPTER_IMPLEMENTED'
  | 'OPERATIONAL'
  | 'DEPRECATED'
  | 'BLOCKED';

export type ProviderOperationCategory =
  | 'CONNECTION_TEST'
  | 'LIST_MODELS'
  | 'GENERATE_TEXT';

export interface ProviderMetadata {
  readonly id: AiProviderId;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly docsUrl: string;
  readonly keyPlaceholder: string;
  readonly helpText: string;
  readonly integrationStatus: IntegrationStatus;
  readonly supportedOperations: readonly ProviderOperationCategory[];
  readonly defaultCapabilities: ProviderCapabilities;
  readonly defaultEndpoint: string;
  readonly allowedHosts: readonly string[];
}

/**
 * Canonical baseline capabilities grounded in official provider documentation.
 */
const OPENAI_BASELINE_CAPABILITIES: ProviderCapabilities = {
  textInput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/api-reference/chat' }),
  textGeneration: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/api-reference/chat' }),
  structuredOutput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/guides/structured-outputs' }),
  toolCalling: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/guides/function-calling' }),
  streaming: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/api-reference/streaming' }),
  cancellation: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Standard client-side HTTP abort signal supported' }),
  usageMetadata: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Returns prompt_tokens, completion_tokens, total_tokens' }),
  modelListing: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://api.openai.com/v1/models' }),
  imageInput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://platform.openai.com/docs/guides/vision' }),
  systemPrompt: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported via system role message in Chat Completions' }),
  temperatureControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported range 0.0 to 2.0' }),
  maxTokensControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'max_tokens or max_completion_tokens' }),
};

const OPENROUTER_BASELINE_CAPABILITIES: ProviderCapabilities = {
  textInput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://openrouter.ai/docs' }),
  textGeneration: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://openrouter.ai/docs' }),
  structuredOutput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported when underlying upstream model supports JSON mode/schema' }),
  toolCalling: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported depending on upstream model tool support' }),
  streaming: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://openrouter.ai/docs#streaming' }),
  cancellation: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Client HTTP abort supported' }),
  usageMetadata: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Returns token counts and native generation cost' }),
  modelListing: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://openrouter.ai/api/v1/models' }),
  imageInput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported on vision-capable routed models' }),
  systemPrompt: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Forwarded to upstream model' }),
  temperatureControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Configurable across standard models' }),
  maxTokensControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Configurable' }),
};

const NIM_BASELINE_CAPABILITIES: ProviderCapabilities = {
  textInput: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://docs.api.nvidia.com' }),
  textGeneration: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://docs.api.nvidia.com' }),
  structuredOutput: declareCapability('UNKNOWN', 'OFFICIAL_DOCUMENTATION', { notes: 'Varies by containerized NIM model recipe' }),
  toolCalling: declareCapability('UNKNOWN', 'OFFICIAL_DOCUMENTATION', { notes: 'Model-dependent across NIM catalog' }),
  streaming: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Server-sent events supported by OpenAI-compatible endpoint' }),
  cancellation: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Client HTTP abort supported' }),
  usageMetadata: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Returns OpenAI-compatible usage object' }),
  modelListing: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { sourceReference: 'https://integrate.api.nvidia.com/v1/models' }),
  imageInput: declareCapability('UNKNOWN', 'OFFICIAL_DOCUMENTATION', { notes: 'Requires specialized vision-language NIM microservices' }),
  systemPrompt: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported via OpenAI-compatible Chat format' }),
  temperatureControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported' }),
  maxTokensControl: declareCapability('SUPPORTED', 'OFFICIAL_DOCUMENTATION', { notes: 'Supported' }),
};

export const BASELINE_PROVIDER_METADATA: Record<AiProviderId, ProviderMetadata> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'Industry-standard frontier models including GPT-4o and o1 reasoning engines.',
    category: 'Primary AI Model',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-proj-...',
    helpText: 'Generate a secret API key from your OpenAI platform dashboard with model read permissions.',
    integrationStatus: 'CONTRACT_DEFINED',
    supportedOperations: ['CONNECTION_TEST', 'LIST_MODELS', 'GENERATE_TEXT'],
    defaultCapabilities: OPENAI_BASELINE_CAPABILITIES,
    defaultEndpoint: 'https://api.openai.com/v1',
    allowedHosts: ['api.openai.com'],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified multi-provider gateway supporting open weights, Claude, and specialized models.',
    category: 'Multi-Model Router',
    docsUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-...',
    helpText: 'Obtain an API key from OpenRouter settings. Supports transparent model switching and fallback.',
    integrationStatus: 'CONTRACT_DEFINED',
    supportedOperations: ['CONNECTION_TEST', 'LIST_MODELS', 'GENERATE_TEXT'],
    defaultCapabilities: OPENROUTER_BASELINE_CAPABILITIES,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    allowedHosts: ['openrouter.ai'],
  },
  nim: {
    id: 'nim',
    name: 'NVIDIA NIM',
    description: 'Hardware-accelerated inference microservices optimized for enterprise throughput and accuracy.',
    category: 'High-Performance Inference',
    docsUrl: 'https://build.nvidia.com',
    keyPlaceholder: 'nvapi-...',
    helpText: 'Generate an API key from NVIDIA Build platform for containerized model microservices.',
    integrationStatus: 'CONTRACT_DEFINED',
    supportedOperations: ['CONNECTION_TEST', 'LIST_MODELS', 'GENERATE_TEXT'],
    defaultCapabilities: NIM_BASELINE_CAPABILITIES,
    defaultEndpoint: 'https://integrate.api.nvidia.com/v1',
    allowedHosts: ['integrate.api.nvidia.com'],
  },
};
