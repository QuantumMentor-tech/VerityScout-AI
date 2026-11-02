/**
 * VerityScout AI — Canonical AI Provider Identifiers
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Primary Architectural Rule:
 * Stable, typed canonical provider identifiers that match persisted settings from Step 26.
 */

export const AI_PROVIDER_IDS = ['openai', 'openrouter', 'nim'] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/**
 * Backward-compatible alias aligning with Step 26 provider settings DTOs.
 */
export type SupportedAiProviderId = AiProviderId;

/**
 * Type guard for validating whether an arbitrary string is a canonical AI Provider ID.
 */
export function isAiProviderId(val: unknown): val is AiProviderId {
  return typeof val === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(val);
}

/**
 * Asserts that a value is a canonical AI Provider ID, throwing a formatted TypeError otherwise.
 */
export function assertValidProviderId(val: unknown): asserts val is AiProviderId {
  if (!isAiProviderId(val)) {
    throw new TypeError(
      `Invalid provider ID: "${String(val)}". Approved canonical providers are: ${AI_PROVIDER_IDS.join(', ')}`
    );
  }
}
