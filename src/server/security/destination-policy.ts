import 'server-only';

/**
 * VerityScout AI — Network Destination Policies & Security Boundaries
 * Governed by: Step 32 (Safe URL Validation, SSRF Prevention, Redirect Protection, and Network Destination Controls)
 *
 * Establishes two strictly decoupled policy classes:
 * 1. PUBLIC_RESEARCH_SOURCE_POLICY: For untrusted search-result links and user-provided research URLs.
 * 2. TRUSTED_PROVIDER_POLICY: For privileged, credential-bearing AI provider API calls.
 */

export type DestinationPolicyType = 'PUBLIC_RESEARCH_SOURCE' | 'TRUSTED_PROVIDER';

export interface PublicResearchSourcePolicyConfig {
  readonly type: 'PUBLIC_RESEARCH_SOURCE';
  readonly allowedProtocols: readonly ['http:', 'https:'];
  readonly allowedPorts: readonly [80, 443];
  readonly allowNonPublicIps: false;
  readonly maxRedirects: number;
  readonly maxResponseBytes: number;
  readonly connectTimeoutMs: number;
  readonly responseTimeoutMs: number;
  readonly forwardCredentials: false;
  readonly allowedMethods: readonly ['GET', 'HEAD'];
}

export interface TrustedProviderPolicyConfig {
  readonly type: 'TRUSTED_PROVIDER';
  readonly allowedProtocols: readonly ['https:'];
  readonly allowedPorts: readonly [443];
  readonly approvedHosts: readonly string[];
  readonly maxRedirects: 0; // Automatic redirects strictly disabled for credential-bearing calls
  readonly forwardCredentials: true; // Only to approved provider origin
  readonly allowedMethods: readonly ['GET', 'POST'];
}

export const PUBLIC_RESEARCH_SOURCE_POLICY: PublicResearchSourcePolicyConfig = {
  type: 'PUBLIC_RESEARCH_SOURCE',
  allowedProtocols: ['http:', 'https:'],
  allowedPorts: [80, 443],
  allowNonPublicIps: false,
  maxRedirects: 5,
  maxResponseBytes: 5 * 1024 * 1024, // 5 MB ceiling prevents resource exhaustion
  connectTimeoutMs: 5000, // 5s connection threshold
  responseTimeoutMs: 15000, // 15s total response completion threshold
  forwardCredentials: false,
  allowedMethods: ['GET', 'HEAD'],
};

export const APPROVED_PROVIDER_HOSTS: readonly string[] = [
  'api.openai.com',
  'openrouter.ai',
  'integrate.api.nvidia.com',
  'api.tavily.com',
  'api.exa.ai',
  'api.firecrawl.dev',
] as const;

export const TRUSTED_PROVIDER_POLICY: TrustedProviderPolicyConfig = {
  type: 'TRUSTED_PROVIDER',
  allowedProtocols: ['https:'],
  allowedPorts: [443],
  approvedHosts: APPROVED_PROVIDER_HOSTS,
  maxRedirects: 0,
  forwardCredentials: true,
  allowedMethods: ['GET', 'POST'],
};

