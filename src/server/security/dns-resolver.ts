import 'server-only';
import dns from 'node:dns';
import net from 'node:net';
import {
  type IpClassificationResult,
  classifyIpAddress,
} from './ip-classifier';

export type DnsValidationErrorCode =
  | 'DNS_RESOLUTION_FAILED'
  | 'DNS_RESOLUTION_EMPTY'
  | 'DNS_ANSWER_PROHIBITED'
  | 'DNS_MALFORMED_ANSWER';

export interface ValidatedDnsAddress {
  readonly address: string;
  readonly family: 4 | 6;
  readonly classification: IpClassificationResult;
}

export interface ValidatedDnsResult {
  readonly isValid: true;
  readonly hostname: string;
  readonly addresses: readonly ValidatedDnsAddress[];
  readonly selectedIp: string;
  readonly selectedFamily: 4 | 6;
}

export interface InvalidDnsResult {
  readonly isValid: false;
  readonly hostname: string;
  readonly code: DnsValidationErrorCode;
  readonly error: string;
  readonly prohibitedAddress?: string;
}

export type DnsResolutionResult = ValidatedDnsResult | InvalidDnsResult;

export type DnsLookupFunction = (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<readonly { address: string; family: number }[]>;

export interface ResolveDnsOptions {
  readonly lookupFn?: DnsLookupFunction | undefined;
}

/**
 * Resolves a hostname and validates ALL A and AAAA addresses against prohibited IP ranges.
 * Implements strict fail-closed mixed-answer protection (if ANY resolved IP is private, the entire answer is rejected).
 */
export async function resolveAndValidateDns(
  hostname: string,
  options?: ResolveDnsOptions
): Promise<DnsResolutionResult> {
  // If the hostname is already an IP literal, classify directly without DNS query
  const ipFamily = net.isIP(hostname);
  if (ipFamily !== 0) {
    const classification = classifyIpAddress(hostname);
    if (!classification.isPublic) {
      return {
        isValid: false,
        hostname,
        code: 'DNS_ANSWER_PROHIBITED',
        error: `Literal IP destination is non-public: ${classification.reason}`,
        prohibitedAddress: hostname,
      };
    }
    return {
      isValid: true,
      hostname,
      addresses: [
        {
          address: hostname,
          family: ipFamily as 4 | 6,
          classification,
        },
      ],
      selectedIp: hostname,
      selectedFamily: ipFamily as 4 | 6,
    };
  }

  const lookup = options?.lookupFn ?? (dns.promises.lookup as unknown as DnsLookupFunction);

  let rawAnswers: readonly { address: string; family: number }[];
  try {
    rawAnswers = await lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      hostname,
      code: 'DNS_RESOLUTION_FAILED',
      error: `DNS resolution failed for hostname "${hostname}": ${message}`,
    };
  }

  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    return {
      isValid: false,
      hostname,
      code: 'DNS_RESOLUTION_EMPTY',
      error: `DNS resolution returned zero records for hostname "${hostname}"`,
    };
  }

  const validatedAddresses: ValidatedDnsAddress[] = [];

  for (const record of rawAnswers) {
    if (!record || typeof record.address !== 'string') {
      return {
        isValid: false,
        hostname,
        code: 'DNS_MALFORMED_ANSWER',
        error: `DNS answer contained invalid or malformed record for hostname "${hostname}"`,
      };
    }

    const classification = classifyIpAddress(record.address);

    if (!classification.isPublic) {
      // Fail closed: reject immediately if ANY address in the DNS set is private/prohibited
      return {
        isValid: false,
        hostname,
        code: 'DNS_ANSWER_PROHIBITED',
        error: `DNS answer for "${hostname}" contains prohibited destination IP (${record.address}): ${classification.reason}`,
        prohibitedAddress: record.address,
      };
    }

    validatedAddresses.push({
      address: record.address,
      family: classification.family,
      classification,
    });
  }

  // Deterministically select the first validated public IP address
  const selected = validatedAddresses[0];
  if (!selected) {
    return {
      isValid: false,
      hostname,
      code: 'DNS_RESOLUTION_EMPTY',
      error: `No valid public address available for hostname "${hostname}"`,
    };
  }

  return {
    isValid: true,
    hostname,
    addresses: validatedAddresses,
    selectedIp: selected.address,
    selectedFamily: selected.family,
  };
}
