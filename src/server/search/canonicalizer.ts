import 'server-only';
import { validateUrl } from '@/server/security';

/**
 * VerityScout AI — URL Canonicalization Engine
 * Governed by: Step 35 (URL Canonicalization, Source Deduplication, Provenance Tracking, and Search Result Counters)
 *
 * Core Tenets:
 * 1. Standards-compliant WHATWG URL parsing.
 * 2. Conservative query parameter stripping using an explicit allowlist of tracking parameters.
 * 3. Strict preservation of content-affecting parameters (id, sku, variant, page, q, filter, etc.).
 * 4. Deterministic query parameter sorting for remaining parameters.
 * 5. Default port stripping (:80, :443) while strictly preserving non-default ports (:8080, :8443, :3000).
 * 6. Hostname trailing dot removal without altering destination validity.
 * 7. Path case and trailing slash preservation (conservative: servers may treat /item and /item/ distinctly).
 * 8. Fragments stripped from canonical source identity, but preserved for provenance.
 * 9. Pure, deterministic, zero-network execution.
 */

export const CANONICALIZER_POLICY_VERSION = 'v1';

/**
 * Explicit, reviewed allowlist of non-content tracking query parameters safe to strip.
 * Content parameters, pagination, filtering, locale, variant, and product identifiers are strictly preserved.
 */
export const APPROVED_TRACKING_PARAMS: ReadonlySet<string> = new Set([
  // Google Analytics & Marketing Platform (UTM)
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',

  // Google Click Identifiers
  'gclid',
  'gclsrc',
  'dclid',
  '_ga',
  '_gl',

  // Facebook / Meta Click Identifier
  'fbclid',

  // Microsoft Advertising / Bing Click Identifier
  'msclkid',

  // Twitter / X Click Identifier
  'twclid',

  // Instagram Click Identifier
  'igshid',

  // HubSpot Tracking
  '_hsenc',
  '_hsmi',

  // Mailchimp Tracking
  'mc_eid',
  'mc_cid',

  // Affiliate & Ad Networks
  'zanpid',
  'wickedid',
  'oly_anon_id',
  'oly_enc_id',
]);

export interface CanonicalUrlResult {
  readonly originalUrl: string;
  readonly canonicalUrl: string;
  readonly domain: string;
  readonly scheme: string;
  readonly port: number | null;
  readonly removedParams: readonly string[];
  readonly preservedParams: readonly string[];
  readonly hasFragment: boolean;
  readonly originalFragment: string | null;
  readonly version: string;
  readonly isSuccess: boolean;
  readonly error?: string | undefined;
}

export type CanonicalHintStatus =
  | 'NO_HINT'
  | 'SAME_ORIGIN_MATCH'
  | 'SAME_ORIGIN_DIFFERENT'
  | 'CROSS_ORIGIN'
  | 'INVALID_URL'
  | 'UNSAFE_DESTINATION';

export interface CanonicalHintEvaluation {
  readonly rawHint: string | null;
  readonly status: CanonicalHintStatus;
  readonly resolvedUrl: string | null;
  readonly isSameOrigin: boolean;
  readonly notes: string;
}

/**
 * Deterministically canonicalizes a URL according to the v1 canonicalization policy.
 */
export function canonicalizeUrl(rawUrl: string): CanonicalUrlResult {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return {
      originalUrl: rawUrl ?? '',
      canonicalUrl: '',
      domain: '',
      scheme: '',
      port: null,
      removedParams: [],
      preservedParams: [],
      hasFragment: false,
      originalFragment: null,
      version: CANONICALIZER_POLICY_VERSION,
      isSuccess: false,
      error: 'Empty or non-string URL supplied',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    return {
      originalUrl: rawUrl,
      canonicalUrl: rawUrl,
      domain: '',
      scheme: '',
      port: null,
      removedParams: [],
      preservedParams: [],
      hasFragment: false,
      originalFragment: null,
      version: CANONICALIZER_POLICY_VERSION,
      isSuccess: false,
      error: `Malformed URL: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Scheme validation: strictly http or https
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    return {
      originalUrl: rawUrl,
      canonicalUrl: rawUrl,
      domain: parsed.hostname,
      scheme,
      port: parsed.port ? parseInt(parsed.port, 10) : null,
      removedParams: [],
      preservedParams: [],
      hasFragment: Boolean(parsed.hash),
      originalFragment: parsed.hash ? parsed.hash.substring(1) : null,
      version: CANONICALIZER_POLICY_VERSION,
      isSuccess: false,
      error: `Unsupported scheme "${scheme}". Only http: and https: are permitted for canonical source identity.`,
    };
  }

  // Fragment extraction: extract for provenance, strip from canonical URL
  const originalFragment = parsed.hash ? parsed.hash.substring(1) : null;
  const hasFragment = Boolean(parsed.hash);
  parsed.hash = '';

  // Hostname normalization:
  // 1. Lowercase hostname (standard WHATWG does this, but ensure consistency)
  let hostname = parsed.hostname.toLowerCase();
  // 2. Remove trailing dot if present (e.g. "example.com." -> "example.com")
  if (hostname.endsWith('.') && hostname.length > 1) {
    hostname = hostname.slice(0, -1);
    parsed.hostname = hostname;
  }

  // Port normalization:
  // Default ports (80 for http, 443 for https) are omitted by WHATWG URL.
  // Non-default ports (e.g. 8080, 8443, 3000) are preserved.
  const port = parsed.port ? parseInt(parsed.port, 10) : null;

  // Query parameter normalization:
  // Track removed and preserved parameters
  const removedParams: string[] = [];
  const preservedEntries: Array<{ key: string; value: string }> = [];

  for (const [key, val] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (APPROVED_TRACKING_PARAMS.has(lowerKey)) {
      removedParams.push(key);
    } else {
      preservedEntries.push({ key, value: val });
    }
  }

  // Clear searchParams and re-insert preserved parameters in deterministic order
  parsed.search = '';
  // Sort preserved keys lexicographically, preserving order of repeated keys
  preservedEntries.sort((a, b) => {
    const keyComp = a.key.localeCompare(b.key);
    if (keyComp !== 0) return keyComp;
    return a.value.localeCompare(b.value);
  });

  for (const entry of preservedEntries) {
    parsed.searchParams.append(entry.key, entry.value);
  }

  const preservedParams = preservedEntries.map((e) => e.key);
  const canonicalUrl = parsed.toString();

  return {
    originalUrl: rawUrl,
    canonicalUrl,
    domain: hostname,
    scheme: scheme.replace(':', ''),
    port,
    removedParams,
    preservedParams,
    hasFragment,
    originalFragment,
    version: CANONICALIZER_POLICY_VERSION,
    isSuccess: true,
  };
}

/**
 * Evaluates a page-reported canonical link hint (<link rel="canonical" href="...">)
 * against the discovered source URL.
 *
 * Core Principle: Canonical hints from third-party HTML are UNTRUSTED hints.
 * They are NEVER automatically substituted for the application's canonical URL
 * and NEVER initiate outbound network requests.
 */
export function evaluateCanonicalHint(
  rawHint: string | null | undefined,
  sourceUrl: string
): CanonicalHintEvaluation {
  if (!rawHint || rawHint.trim().length === 0) {
    return {
      rawHint: null,
      status: 'NO_HINT',
      resolvedUrl: null,
      isSameOrigin: false,
      notes: 'No page-reported canonical hint provided.',
    };
  }

  let sourceParsed: URL;
  try {
    sourceParsed = new URL(sourceUrl);
  } catch {
    return {
      rawHint,
      status: 'INVALID_URL',
      resolvedUrl: null,
      isSameOrigin: false,
      notes: 'Source URL is invalid; cannot resolve relative canonical hint.',
    };
  }

  let hintParsed: URL;
  try {
    // Resolve relative canonical URLs against the source URL
    hintParsed = new URL(rawHint.trim(), sourceParsed);
  } catch (err) {
    return {
      rawHint,
      status: 'INVALID_URL',
      resolvedUrl: null,
      isSameOrigin: false,
      notes: `Failed to parse canonical hint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Validate scheme
  const hintScheme = hintParsed.protocol.toLowerCase();
  if (hintScheme !== 'http:' && hintScheme !== 'https:') {
    return {
      rawHint,
      status: 'INVALID_URL',
      resolvedUrl: null,
      isSameOrigin: false,
      notes: `Canonical hint uses disallowed scheme "${hintScheme}".`,
    };
  }

  // Security check: ensure hint does not point to SSRF destination
  const validation = validateUrl(hintParsed.toString(), 'PUBLIC_RESEARCH_SOURCE');
  if (!validation.isValid) {
    return {
      rawHint,
      status: 'UNSAFE_DESTINATION',
      resolvedUrl: hintParsed.toString(),
      isSameOrigin: false,
      notes: `Canonical hint references prohibited network destination: ${validation.error}`,
    };
  }

  // Origin comparison
  const isSameOrigin = hintParsed.origin.toLowerCase() === sourceParsed.origin.toLowerCase();
  const hintCanonical = canonicalizeUrl(hintParsed.toString()).canonicalUrl;
  const sourceCanonical = canonicalizeUrl(sourceParsed.toString()).canonicalUrl;

  if (isSameOrigin) {
    if (hintCanonical === sourceCanonical) {
      return {
        rawHint,
        status: 'SAME_ORIGIN_MATCH',
        resolvedUrl: hintCanonical,
        isSameOrigin: true,
        notes: 'Page canonical hint matches computed canonical source URL exactly.',
      };
    }
    return {
      rawHint,
      status: 'SAME_ORIGIN_DIFFERENT',
      resolvedUrl: hintCanonical,
      isSameOrigin: true,
      notes: 'Page canonical hint specifies a different internal path or parameters on the same origin.',
    };
  }

  return {
    rawHint,
    status: 'CROSS_ORIGIN',
    resolvedUrl: hintCanonical,
    isSameOrigin: false,
    notes: `Page canonical hint points to external domain "${hintParsed.hostname}". Untrusted cross-origin hint preserved as metadata.`,
  };
}

