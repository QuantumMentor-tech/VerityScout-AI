import 'server-only';

/**
 * VerityScout AI — Server Provider Subsystem
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 */

export * from './contracts';
export * from './connection-tester';
export * from './registry';
export {
  OpenAiProviderAdapter,
  mapNormalizedRequestToOpenAiResponses,
  mapOpenAiResponsesToNormalized,
  mapOpenAiHttpError,
  type OpenAiAdapterOptions,
} from './adapters/openai';
export {
  OpenRouterProviderAdapter,
  mapNormalizedRequestToOpenRouter,
  mapOpenRouterResponseToNormalized,
  mapOpenRouterHttpError,
} from './adapters/openrouter';
export {
  NimProviderAdapter,
  mapNormalizedRequestToNim,
  mapNimResponseToNormalized,
  mapNimHttpError,
  type NimAdapterOptions,
} from './adapters/nim';


