/**
 * VerityScout AI — Provider Settings & Credential Configuration Contracts
 * Governed by: Step 26 (AI Provider Settings CRUD, Secure Credential UI, Connection Tests)
 */

export const SUPPORTED_AI_PROVIDERS = ['openai', 'openrouter', 'nim'] as const;
export type SupportedAiProviderId = (typeof SUPPORTED_AI_PROVIDERS)[number];

export function isSupportedAiProvider(providerId: string): providerId is SupportedAiProviderId {
  return SUPPORTED_AI_PROVIDERS.includes(providerId as SupportedAiProviderId);
}

export interface ProviderDefinition {
  id: SupportedAiProviderId;
  name: string;
  description: string;
  category: string;
  docsUrl: string;
  keyPlaceholder: string;
  helpText: string;
}

export const BASELINE_AI_PROVIDER_DEFINITIONS: Record<SupportedAiProviderId, ProviderDefinition> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'Industry-standard frontier models including GPT-4o and o1 reasoning engines.',
    category: 'Primary AI Model',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-proj-...',
    helpText: 'Generate a secret API key from your OpenAI platform dashboard with model read permissions.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified multi-provider gateway supporting open weights, Claude, and specialized models.',
    category: 'Multi-Model Router',
    docsUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-v1-...',
    helpText: 'Obtain an API key from OpenRouter settings. Supports transparent model switching and fallback.',
  },
  nim: {
    id: 'nim',
    name: 'NVIDIA NIM',
    description: 'Hardware-accelerated inference microservices optimized for enterprise throughput and accuracy.',
    category: 'High-Performance Inference',
    docsUrl: 'https://build.nvidia.com',
    keyPlaceholder: 'nvapi-...',
    helpText: 'Generate an API key from NVIDIA Build platform for containerized model microservices.',
  },
};

export type ConnectionTestStatus = 'SUCCESS' | 'FAILED' | 'UNTESTED';

export interface ProviderSettingsItemDTO {
  id: SupportedAiProviderId;
  name: string;
  description: string;
  category: string;
  docsUrl: string;
  keyPlaceholder: string;
  helpText: string;
  isConfigured: boolean;
  isEnabled: boolean;
  credentialPreview: string | null;
  lastConnectionTestStatus: ConnectionTestStatus;
  lastConnectionTestAt: string | null;
  selectedModelId: string | null;
  updatedAt: string | null;
}

export interface SaveProviderConfigInput {
  providerId: SupportedAiProviderId;
  apiKey?: string;
  isEnabled?: boolean;
  selectedModelId?: string | null;
}

export interface UpdateProviderConfigInput {
  isEnabled?: boolean;
  selectedModelId?: string | null;
}

export interface ConnectionTestResponseDTO {
  success: boolean;
  code: string;
  message: string;
  testedAt: string;
  durationMs: number;
}
