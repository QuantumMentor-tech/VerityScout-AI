/**
 * VerityScout AI — Capability Metadata Contracts
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Trinary representation: SUPPORTED, UNSUPPORTED, UNKNOWN.
 * 2. Unverified capabilities are NEVER silently promoted to supported.
 * 3. Separation of declaration from credential validity and connectivity.
 */

export type CapabilitySupport = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';

export type CapabilityProvenance =
  | 'CONTRACT_DEFINED'
  | 'OFFICIAL_DOCUMENTATION'
  | 'VERIFIED_CATALOG'
  | 'INTEGRATION_TESTED';

export interface CapabilityDeclaration {
  readonly status: CapabilitySupport;
  readonly provenance: CapabilityProvenance;
  readonly verifiedAt?: string;
  readonly sourceReference?: string;
  readonly notes?: string;
}

/**
 * Common capability dimensions required for VerityScout AI's evidence synthesis operations.
 */
export interface ProviderCapabilities {
  /** Supports arbitrary natural language user/system prompt input */
  readonly textInput: CapabilityDeclaration;
  /** Supports text/markdown completion and synthesis generation */
  readonly textGeneration: CapabilityDeclaration;
  /** Supports structured output (JSON mode or strict JSON schema enforcement) */
  readonly structuredOutput: CapabilityDeclaration;
  /** Supports function / tool calling for search retrieval or evidence extraction */
  readonly toolCalling: CapabilityDeclaration;
  /** Supports server-sent event token streaming */
  readonly streaming: CapabilityDeclaration;
  /** Supports request abort / cancellation via AbortSignal */
  readonly cancellation: CapabilityDeclaration;
  /** Returns structured token consumption (prompt, completion, total) */
  readonly usageMetadata: CapabilityDeclaration;
  /** Exposes a remote model discovery or catalog listing endpoint */
  readonly modelListing: CapabilityDeclaration;
  /** Accepts image input / vision analysis for visual evidence evaluation */
  readonly imageInput: CapabilityDeclaration;
  /** Supports dedicated system instruction / system role messages */
  readonly systemPrompt: CapabilityDeclaration;
  /** Allows programmatic adjustment of sampling temperature */
  readonly temperatureControl: CapabilityDeclaration;
  /** Allows programmatic capping of output tokens */
  readonly maxTokensControl: CapabilityDeclaration;
}

export function declareCapability(
  status: CapabilitySupport,
  provenance: CapabilityProvenance,
  options?: {
    verifiedAt?: string;
    sourceReference?: string;
    notes?: string;
  }
): CapabilityDeclaration {
  return {
    status,
    provenance,
    ...(options?.verifiedAt ? { verifiedAt: options.verifiedAt } : {}),
    ...(options?.sourceReference ? { sourceReference: options.sourceReference } : {}),
    ...(options?.notes ? { notes: options.notes } : {}),
  };
}
