import 'server-only';
import net from 'node:net';
import {
  type DestinationPolicyType,
  PUBLIC_RESEARCH_SOURCE_POLICY,
  TRUSTED_PROVIDER_POLICY,
} from './destination-policy';
import {
  type IpClassificationResult,
  classifyIpAddress,
} from './ip-classifier';

export type UrlValidationErrorCode =
  | 'MISSING_URL'
  | 'EMPTY_URL'
  | 'MALFORMED_URL'
  | 'PROTOCOL_RELATIVE_URL'
  | 'RELATIVE_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'HTTP_DOWNGRADE_PROHIBITED'
  | 'URL_CONTAINS_CREDENTIALS'
  | 'MISSING_HOSTNAME'
  | 'SCOPED_IPV6_PROHIBITED'
  | 'PROHIBITED_PORT'
  | 'PROHIBITED_IP_DESTINATION'
  | 'UNAPPROVED_PROVIDER_HOST';

export interface ValidatedUrlResult {
  readonly isValid: true;
  readonly parsedUrl: URL;
  readonly canonicalUrl: string;
  readonly hostname: string;
  readonly protocol: 'http:' | 'https:';
  readonly port: number;
  readonly isIpLiteral: boolean;
  readonly ipClassification?: IpClassificationResult;
}

export interface InvalidUrlResult {
  readonly isValid: false;
  readonly code: UrlValidationErrorCode;
  readonly error: string;
}

export type UrlValidationResult = ValidatedUrlResult | InvalidUrlResult;

/**
 * Validates and canonicalizes an untrusted URL string against a specific destination policy.
 * Uses standards-compliant WHATWG URL parser with strict security boundary checks.
 */
export function validateUrl(
  rawUrl: unknown,
  policyType: DestinationPolicyType = 'PUBLIC_RESEARCH_SOURCE'
): UrlValidationResult {
  // 1. Basic Type & Emptiness Checks
  if (rawUrl === null || rawUrl === undefined) {
    return {
      isValid: false,
      code: 'MISSING_URL',
      error: 'URL is required but was not provided',
    };
  }

  if (typeof rawUrl !== 'string') {
    return {
      isValid: false,
      code: 'MALFORMED_URL',
      error: 'URL must be a string value',
    };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      code: 'EMPTY_URL',
      error: 'URL string is empty or whitespace-only',
    };
  }

  // 2. Reject Protocol-Relative URLs (e.g. //example.com/path)
  if (trimmed.startsWith('//')) {
    return {
      isValid: false,
      code: 'PROTOCOL_RELATIVE_URL',
      error: 'Protocol-relative URLs are prohibited; an explicit scheme (http:// or https://) is required',
    };
  }

  // 3. Standards-Compliant WHATWG URL Parsing
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isValid: false,
      code: 'MALFORMED_URL',
      error: 'URL is malformed or cannot be parsed by WHATWG URL standard',
    };
  }

  // 4. Scheme & Protocol Restrictions
  const protocol = parsed.protocol.toLowerCase();

  if (policyType === 'TRUSTED_PROVIDER') {
    if (protocol === 'http:') {
      return {
        isValid: false,
        code: 'HTTP_DOWNGRADE_PROHIBITED',
        error: 'HTTP downgrade is strictly prohibited for AI provider endpoints; HTTPS is required',
      };
    }
    if (protocol !== 'https:') {
      return {
        isValid: false,
        code: 'UNSUPPORTED_PROTOCOL',
        error: `Protocol "${protocol}" is prohibited for AI providers (strictly https: is allowed)`,
      };
    }
  } else {
    // PUBLIC_RESEARCH_SOURCE
    if (!PUBLIC_RESEARCH_SOURCE_POLICY.allowedProtocols.includes(protocol as 'http:' | 'https:')) {
      return {
        isValid: false,
        code: 'UNSUPPORTED_PROTOCOL',
        error: `Protocol "${protocol}" is prohibited for public research sources (only http: and https: are allowed)`,
      };
    }
  }

  // 5. Embedded Credentials Detection
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      code: 'URL_CONTAINS_CREDENTIALS',
      error: 'URL contains prohibited embedded username or password authentication data',
    };
  }

  // 6. Hostname Validation & Normalization
  let hostname = parsed.hostname;
  if (!hostname || hostname.length === 0) {
    return {
      isValid: false,
      code: 'MISSING_HOSTNAME',
      error: 'URL lacks a valid destination hostname',
    };
  }

  // Normalize trailing dot (e.g. "example.com." -> "example.com")
  if (hostname.endsWith('.')) {
    hostname = hostname.slice(0, -1);
  }

  // Reject scoped IPv6 with interface identifiers (e.g. [fe80::1%eth0])
  if (hostname.includes('%')) {
    return {
      isValid: false,
      code: 'SCOPED_IPV6_PROHIBITED',
      error: 'Scoped IPv6 addresses with zone identifiers are prohibited',
    };
  }

  // Strip brackets from IPv6 hostnames for IP classification
  const unbracketedHost = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // 7. Port Validation
  const effectivePort = parsed.port
    ? parseInt(parsed.port, 10)
    : protocol === 'https:'
      ? 443
      : 80;

  if (isNaN(effectivePort) || effectivePort < 1 || effectivePort > 65535) {
    return {
      isValid: false,
      code: 'PROHIBITED_PORT',
      error: `Invalid port number: "${parsed.port}"`,
    };
  }

  if (policyType === 'TRUSTED_PROVIDER') {
    if (!TRUSTED_PROVIDER_POLICY.allowedPorts.includes(effectivePort as 443)) {
      return {
        isValid: false,
        code: 'PROHIBITED_PORT',
        error: `Port ${effectivePort} is prohibited for AI provider endpoints (only port 443 is permitted)`,
      };
    }
  } else {
    if (!PUBLIC_RESEARCH_SOURCE_POLICY.allowedPorts.includes(effectivePort as 80 | 443)) {
      return {
        isValid: false,
        code: 'PROHIBITED_PORT',
        error: `Port ${effectivePort} is prohibited for public research sources (only standard ports 80 and 443 are permitted)`,
      };
    }
  }

  // 8. Policy-Specific Destination Checks
  if (policyType === 'TRUSTED_PROVIDER') {
    const isApprovedHost = TRUSTED_PROVIDER_POLICY.approvedHosts.some(
      (approved) => approved.toLowerCase() === hostname.toLowerCase()
    );
    if (!isApprovedHost) {
      return {
        isValid: false,
        code: 'UNAPPROVED_PROVIDER_HOST',
        error: `Destination host "${hostname}" is not an approved AI provider host`,
      };
    }
  }

  // 9. IP Literal Classification
  const ipFamily = net.isIP(unbracketedHost);
  const isIpLiteral = ipFamily !== 0;
  let ipClassification: IpClassificationResult | undefined;

  if (isIpLiteral) {
    ipClassification = classifyIpAddress(unbracketedHost);
    if (!ipClassification.isPublic) {
      return {
        isValid: false,
        code: 'PROHIBITED_IP_DESTINATION',
        error: `Destination IP is prohibited for outbound research: ${ipClassification.reason}`,
      };
    }
  }

  // 10. Construct Canonical Normalized Representation
  // WHATWG URL normalizes scheme to lowercase, punycodes IDNs, and strips fragments for HTTP requests
  const canonicalUrl = `${protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}${parsed.search}`;

  return {
    isValid: true,
    parsedUrl: parsed,
    canonicalUrl,
    hostname,
    protocol: protocol as 'http:' | 'https:',
    port: effectivePort,
    isIpLiteral,
    ...(ipClassification ? { ipClassification } : {}),
  };
}

