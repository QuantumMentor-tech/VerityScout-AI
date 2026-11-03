import 'server-only';
import http from 'node:http';
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import {
  type DestinationPolicyType,
  PUBLIC_RESEARCH_SOURCE_POLICY,
  TRUSTED_PROVIDER_POLICY,
} from './destination-policy';
import { validateUrl } from './url-validator';
import {
  type DnsLookupFunction,
  resolveAndValidateDns,
} from './dns-resolver';

export type SafeHttpErrorCode =
  | 'INVALID_URL'
  | 'PROHIBITED_DESTINATION'
  | 'DNS_RESOLUTION_FAILED'
  | 'UNSAFE_REDIRECT'
  | 'EXCESSIVE_REDIRECTS'
  | 'REDIRECT_LOOP'
  | 'RESPONSE_SIZE_EXCEEDED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNSUPPORTED_METHOD'
  | 'TLS_VERIFICATION_FAILED'
  | 'TRANSPORT_ERROR';

export class SafeHttpError extends Error {
  public readonly code: SafeHttpErrorCode;
  public readonly statusCode?: number | undefined;

  constructor(code: SafeHttpErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = 'SafeHttpError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SafeFetchRequestInit {
  readonly method?: 'GET' | 'HEAD' | 'POST' | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: string | undefined;
  readonly policy?: DestinationPolicyType | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly maxRedirects?: number | undefined;
  readonly maxResponseBytes?: number | undefined;
  readonly connectTimeoutMs?: number | undefined;
  readonly responseTimeoutMs?: number | undefined;
  readonly dnsLookupFn?: DnsLookupFunction | undefined;
}

export interface SafeFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly redirectChain: readonly string[];
  readonly text: () => Promise<string>;
  readonly json: <T = unknown>() => Promise<T>;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
}

/**
 * Executes a secure outbound HTTP request with:
 * 1. Strict WHATWG URL parsing and policy validation.
 * 2. Complete DNS answer classification (rejecting mixed public/private answers).
 * 3. Connection-level DNS-rebinding protection (socket pinned to validated IP).
 * 4. Preserved TLS SNI and certificate verification.
 * 5. Independent validation of every redirect destination.
 * 6. Streaming response-size ceilings and bounded timeouts.
 * 7. Zero cross-origin credential forwarding.
 */
export async function safeFetch(
  targetUrl: string,
  init?: SafeFetchRequestInit
): Promise<SafeFetchResponse> {
  const policyType = init?.policy ?? 'PUBLIC_RESEARCH_SOURCE';
  const method = (init?.method ?? 'GET').toUpperCase() as 'GET' | 'HEAD' | 'POST';

  // 1. Enforce Allowed Methods
  if (policyType === 'PUBLIC_RESEARCH_SOURCE') {
    if (!PUBLIC_RESEARCH_SOURCE_POLICY.allowedMethods.includes(method as 'GET' | 'HEAD')) {
      throw new SafeHttpError(
        'UNSUPPORTED_METHOD',
        `HTTP method "${method}" is prohibited for public research source retrieval`
      );
    }
  } else {
    if (!TRUSTED_PROVIDER_POLICY.allowedMethods.includes(method as 'GET' | 'POST')) {
      throw new SafeHttpError(
        'UNSUPPORTED_METHOD',
        `HTTP method "${method}" is prohibited for AI provider requests`
      );
    }
  }

  const maxRedirects = init?.maxRedirects ?? (
    policyType === 'PUBLIC_RESEARCH_SOURCE'
      ? PUBLIC_RESEARCH_SOURCE_POLICY.maxRedirects
      : TRUSTED_PROVIDER_POLICY.maxRedirects
  );

  const maxResponseBytes = init?.maxResponseBytes ?? (
    policyType === 'PUBLIC_RESEARCH_SOURCE'
      ? PUBLIC_RESEARCH_SOURCE_POLICY.maxResponseBytes
      : 10 * 1024 * 1024
  );

  const connectTimeoutMs = init?.connectTimeoutMs ?? PUBLIC_RESEARCH_SOURCE_POLICY.connectTimeoutMs;
  const responseTimeoutMs = init?.responseTimeoutMs ?? PUBLIC_RESEARCH_SOURCE_POLICY.responseTimeoutMs;

  let currentUrl = targetUrl;
  let redirectCount = 0;
  const redirectChain: string[] = [];
  const visitedUrls = new Set<string>();

  const currentHeaders: Record<string, string> = { ...(init?.headers ?? {}) };
  if (!currentHeaders['user-agent'] && !currentHeaders['User-Agent']) {
    currentHeaders['User-Agent'] = 'VerityScout-AI/0.1.0 (Security-Audited-Research)';
  }

  while (true) {
    if (init?.signal?.aborted) {
      throw new SafeHttpError('CANCELLED', 'Request was cancelled by caller before dispatch');
    }

    // 2. Validate URL against policy
    const urlValidation = validateUrl(currentUrl, policyType);
    if (!urlValidation.isValid) {
      throw new SafeHttpError('INVALID_URL', `Destination URL validation failed: ${urlValidation.error}`);
    }

    const { canonicalUrl, parsedUrl, hostname, protocol, port } = urlValidation;

    // Check for redirect loops
    if (visitedUrls.has(canonicalUrl)) {
      throw new SafeHttpError('REDIRECT_LOOP', `Detected redirect loop to URL: ${canonicalUrl}`);
    }
    visitedUrls.add(canonicalUrl);

    // 3. DNS Resolution & Rebinding Validation
    const dnsResult = await resolveAndValidateDns(hostname, { lookupFn: init?.dnsLookupFn });
    if (!dnsResult.isValid) {
      throw new SafeHttpError(
        'PROHIBITED_DESTINATION',
        `Destination DNS validation failed for "${hostname}": ${dnsResult.error}`
      );
    }

    const validatedIp = dnsResult.selectedIp;
    const validatedFamily = dnsResult.selectedFamily;

    // 4. Dispatch Request with Socket Pinned to Validated IP
    const singleResponse = await executeSingleSafeRequest({
      parsedUrl,
      canonicalUrl,
      hostname,
      protocol,
      port,
      validatedIp,
      validatedFamily,
      method,
      headers: currentHeaders,
      body: init?.body,
      signal: init?.signal,
      connectTimeoutMs,
      responseTimeoutMs,
      maxResponseBytes,
    });

    // 5. Handle Redirects
    const isRedirect = [301, 302, 303, 307, 308].includes(singleResponse.statusCode);

    if (isRedirect) {
      const locationHeader = singleResponse.headers.location;
      if (!locationHeader) {
        throw new SafeHttpError('UNSAFE_REDIRECT', `HTTP ${singleResponse.statusCode} redirect missing Location header`);
      }

      if (maxRedirects === 0) {
        // Automatic redirects disabled (e.g. for trusted provider calls)
        return buildSafeResponse(singleResponse, canonicalUrl, redirectChain);
      }

      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new SafeHttpError(
          'EXCESSIVE_REDIRECTS',
          `Exceeded maximum allowed redirect hops (${maxRedirects})`
        );
      }

      redirectChain.push(canonicalUrl);

      // Resolve relative redirect against current URL
      let nextUrlStr: string;
      try {
        const resolved = new URL(locationHeader, currentUrl);
        nextUrlStr = resolved.href;
      } catch {
        throw new SafeHttpError('UNSAFE_REDIRECT', `Malformed redirect Location: "${locationHeader}"`);
      }

      // Security: Strip sensitive headers on redirect (e.g. Authorization, Cookie)
      delete currentHeaders['authorization'];
      delete currentHeaders['Authorization'];
      delete currentHeaders['cookie'];
      delete currentHeaders['Cookie'];

      currentUrl = nextUrlStr;
      continue;
    }

    return buildSafeResponse(singleResponse, canonicalUrl, redirectChain);
  }
}

interface SingleRequestOptions {
  readonly parsedUrl: URL;
  readonly canonicalUrl: string;
  readonly hostname: string;
  readonly protocol: 'http:' | 'https:';
  readonly port: number;
  readonly validatedIp: string;
  readonly validatedFamily: 4 | 6;
  readonly method: 'GET' | 'HEAD' | 'POST';
  readonly headers: Record<string, string>;
  readonly body?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly connectTimeoutMs: number;
  readonly responseTimeoutMs: number;
  readonly maxResponseBytes: number;
}

interface RawResponseResult {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly headers: IncomingHttpHeaders;
  readonly bodyBuffer: Buffer;
}

function executeSingleSafeRequest(options: SingleRequestOptions): Promise<RawResponseResult> {
  return new Promise<RawResponseResult>((resolve, reject) => {
    const isHttps = options.protocol === 'https:';
    const client = isHttps ? https : http;

    // Pin connection directly to pre-validated IP while preserving TLS SNI and cert check
    const agent = new client.Agent({
      keepAlive: false,
      lookup: (_host, opts, callback) => {
        if (typeof opts === 'object' && opts?.all) {
          callback(null, [{ address: options.validatedIp, family: options.validatedFamily }]);
        } else {
          callback(null, options.validatedIp, options.validatedFamily);
        }
      },
    });

    const requestOptions: http.RequestOptions = {
      protocol: options.protocol,
      hostname: options.hostname,
      port: options.port,
      path: `${options.parsedUrl.pathname}${options.parsedUrl.search}`,
      method: options.method,
      headers: options.headers,
      agent,
    };

    let hasCleanedUp = false;
    let connectTimer: NodeJS.Timeout | null = null;
    let responseTimer: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (hasCleanedUp) return;
      hasCleanedUp = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      agent.destroy();
    };

    const req = client.request(requestOptions, (res) => {
      if (connectTimer) clearTimeout(connectTimer);

      // Check Content-Length header against max bytes
      const contentLengthHeader = res.headers['content-length'];
      if (contentLengthHeader) {
        const declaredBytes = parseInt(contentLengthHeader, 10);
        if (!isNaN(declaredBytes) && declaredBytes > options.maxResponseBytes) {
          cleanup();
          req.destroy();
          res.destroy();
          return reject(
            new SafeHttpError(
              'RESPONSE_SIZE_EXCEEDED',
              `Declared response size (${declaredBytes} bytes) exceeds safety ceiling of ${options.maxResponseBytes} bytes`
            )
          );
        }
      }

      // Response completion timeout
      responseTimer = setTimeout(() => {
        cleanup();
        req.destroy();
        res.destroy();
        reject(
          new SafeHttpError(
            'TIMEOUT',
            `Response read timed out after ${options.responseTimeoutMs}ms`
          )
        );
      }, options.responseTimeoutMs);

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > options.maxResponseBytes) {
          cleanup();
          req.destroy();
          res.destroy();
          return reject(
            new SafeHttpError(
              'RESPONSE_SIZE_EXCEEDED',
              `Streamed response exceeded safety ceiling of ${options.maxResponseBytes} bytes`
            )
          );
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        cleanup();
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode ?? 200,
          statusMessage: res.statusMessage ?? '',
          headers: res.headers,
          bodyBuffer,
        });
      });

      res.on('error', (err) => {
        cleanup();
        reject(new SafeHttpError('TRANSPORT_ERROR', `Stream reading error: ${err.message}`));
      });
    });

    // Connection timeout
    connectTimer = setTimeout(() => {
      cleanup();
      req.destroy();
      reject(
        new SafeHttpError(
          'TIMEOUT',
          `Connection to ${options.hostname} timed out after ${options.connectTimeoutMs}ms`
        )
      );
    }, options.connectTimeoutMs);

    // Caller cancellation via AbortSignal
    if (options.signal) {
      if (options.signal.aborted) {
        cleanup();
        req.destroy();
        return reject(new SafeHttpError('CANCELLED', 'Request was cancelled by caller'));
      }
      options.signal.addEventListener(
        'abort',
        () => {
          cleanup();
          req.destroy();
          reject(new SafeHttpError('CANCELLED', 'Request was cancelled by caller'));
        },
        { once: true }
      );
    }

    req.on('error', (err: Error & { code?: string }) => {
      cleanup();
      if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
        return reject(new SafeHttpError('CANCELLED', 'Request was aborted'));
      }
      if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        return reject(new SafeHttpError('TLS_VERIFICATION_FAILED', `TLS certificate verification failed: ${err.message}`));
      }
      reject(new SafeHttpError('TRANSPORT_ERROR', `Network transport error: ${err.message}`));
    });

    if (options.body && options.method === 'POST') {
      req.write(options.body);
    }

    req.end();
  });
}

function buildSafeResponse(
  raw: RawResponseResult,
  finalUrl: string,
  redirectChain: readonly string[]
): SafeFetchResponse {
  const textCache = raw.bodyBuffer.toString('utf-8');

  return {
    ok: raw.statusCode >= 200 && raw.statusCode < 300,
    status: raw.statusCode,
    statusText: raw.statusMessage,
    url: finalUrl,
    headers: raw.headers,
    redirectChain,
    text: async () => textCache,
    json: async <T>() => JSON.parse(textCache) as T,
    arrayBuffer: async () => {
      const ab = new ArrayBuffer(raw.bodyBuffer.length);
      const view = new Uint8Array(ab);
      for (let i = 0; i < raw.bodyBuffer.length; i++) {
        view[i] = raw.bodyBuffer[i] ?? 0;
      }
      return ab;
    },
  };
}
