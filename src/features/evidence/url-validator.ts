import type { SourceUrlValidationResult } from './types';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Validates untrusted external source URLs before rendering them as active hyperlinks.
 *
 * Security Requirements (Phase H, OWASP XSS Prevention, RFC 3986):
 * 1. Requires valid URL syntax parsable by standard URL parser.
 * 2. Restricts protocol strictly to http: and https: (rejects javascript:, data:, file:, blob:).
 * 3. Rejects URLs with embedded user credentials (e.g. https://user:pass@host).
 * 4. Extracts canonical domain/hostname for safe display.
 */
export function validateSourceUrl(rawUrl?: string | null): SourceUrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return {
      isValid: false,
      error: 'URL is missing or empty',
    };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'URL contains only whitespace',
    };
  }

  try {
    const parsed = new URL(trimmed);

    // 1. Protocol check
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return {
        isValid: false,
        protocol: parsed.protocol,
        error: `Unsupported or prohibited protocol: "${parsed.protocol}" (only HTTP and HTTPS are permitted)`,
      };
    }

    // 2. Embedded credentials check
    if (parsed.username || parsed.password) {
      return {
        isValid: false,
        error: 'URL contains prohibited embedded authentication credentials',
      };
    }

    // 3. Valid host check
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return {
        isValid: false,
        error: 'URL is missing a valid hostname',
      };
    }

    return {
      isValid: true,
      safeUrl: parsed.href,
      domain: parsed.hostname,
      protocol: parsed.protocol,
    };
  } catch {
    return {
      isValid: false,
      error: 'URL string is malformed or cannot be parsed',
    };
  }
}
