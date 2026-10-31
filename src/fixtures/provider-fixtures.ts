import type { SampleProviderRecord } from './types';

export const PROVIDERS_FIXTURE: readonly SampleProviderRecord[] = [
  {
    id: 'prov-openai',
    name: 'OpenAI (Reasoning & Structured Outputs)',
    category: 'LLM Reasoning',
    supportedModels: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini'],
    status: 'Planned (Phase 5)',
    description: 'Autonomous research decomposition and structured evidence parsing.',
  },
  {
    id: 'prov-openrouter',
    name: 'OpenRouter (Multi-Model Routing)',
    category: 'LLM Reasoning',
    supportedModels: ['anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
    status: 'Planned (Phase 5)',
    description: 'High-throughput fallbacks and flexible open-weights model selection.',
  },
  {
    id: 'prov-nvidia',
    name: 'NVIDIA NIM (Microservices Inference)',
    category: 'LLM Reasoning',
    supportedModels: ['meta/llama-3.1-70b-instruct', 'mistralai/mixtral-8x22b-instruct'],
    status: 'Planned (Phase 5)',
    description: 'High-performance cloud-accelerated inference endpoints.',
  },
  {
    id: 'prov-search',
    name: 'Tavily & Exa Search Adapters',
    category: 'Web Search',
    supportedModels: ['tavily-search-api', 'exa-neural-search'],
    status: 'Planned (Phase 5)',
    description: 'Multi-query web discovery and structured domain-filtered search.',
  },
] as const;
