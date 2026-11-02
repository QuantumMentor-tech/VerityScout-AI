import 'server-only';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { logger } from '@/lib/logging/logger';

/**
 * Strict destination allowlist for provider connection testing.
 * Prevents Server-Side Request Forgery (SSRF) and credential exfiltration.
 */
export const APPROVED_PROVIDER_TEST_ENDPOINTS: Record<string, {
  url: string;
  expectedHost: string;
  method: 'GET';
  headers: (key: string) => Record<string, string>;
}> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    expectedHost: 'api.openai.com',
    method: 'GET',
    headers: (key: string) => ({
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'User-Agent': 'VerityScout-AI/0.1.0 (Security-Connection-Test)',
    }),
  },
  openrouter: {
    url: 'https://openrouter.ai/api/v1/auth/key',
    expectedHost: 'openrouter.ai',
    method: 'GET',
    headers: (key: string) => ({
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'HTTP-Referer': 'https://verityscout.local',
      'X-Title': 'VerityScout AI',
    }),
  },
  nim: {
    url: 'https://integrate.api.nvidia.com/v1/models',
    expectedHost: 'integrate.api.nvidia.com',
    method: 'GET',
    headers: (key: string) => ({
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'User-Agent': 'VerityScout-AI/0.1.0 (Security-Connection-Test)',
    }),
  },
};

export type ConnectionTestResultCode =
  | 'SUCCESS'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'ENDPOINT_NOT_ALLOWED'
  | 'UNKNOWN_ERROR';

export interface ConnectionTestResult {
  success: boolean;
  code: ConnectionTestResultCode;
  message: string;
  testedAt: string;
  durationMs: number;
}

export interface ProviderConnectionTesterOptions {
  credentialService?: ProviderCredentialService;
  configRepo?: ProviderConfigRepository;
  fetchFn?: typeof fetch;
}

/**
 * Validates that an endpoint strictly conforms to the approved HTTPS host allowlist.
 */
export function validateProviderEndpoint(providerId: string, targetUrl: string): void {
  const allowed = APPROVED_PROVIDER_TEST_ENDPOINTS[providerId];
  if (!allowed) {
    throw new Error(`No approved test endpoint defined for provider "${providerId}"`);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new Error('Invalid URL format for provider test endpoint');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Provider test endpoint must use secure HTTPS protocol');
  }

  if (parsed.hostname !== allowed.expectedHost) {
    throw new Error(`Forbidden endpoint destination: "${parsed.hostname}". Expected "${allowed.expectedHost}"`);
  }
}

/**
 * Executes an explicit, user-initiated connection test against a supported provider.
 * Strictly avoids model inference; uses lightweight, non-billable validation endpoints.
 */
export async function testProviderConnection(
  userId: string,
  providerId: string,
  options?: ProviderConnectionTesterOptions
): Promise<ConnectionTestResult> {
  const credentialService = options?.credentialService ?? new ProviderCredentialService();
  const configRepo = options?.configRepo ?? new ProviderConfigRepository();
  const fetchImpl = options?.fetchFn ?? fetch;

  const endpointConfig = APPROVED_PROVIDER_TEST_ENDPOINTS[providerId];
  const testedAt = new Date().toISOString();
  const startTime = Date.now();

  if (!endpointConfig) {
    return {
      success: false,
      code: 'UNKNOWN_ERROR',
      message: `Unsupported provider for connection testing: "${providerId}"`,
      testedAt,
      durationMs: 0,
    };
  }

  // 1. Retrieve decrypted credential from secure server vault
  let apiKey: string | null = null;
  try {
    apiKey = await credentialService.getDecryptedCredential(userId, providerId);
  } catch {
    logger.error('PROVIDER_TEST_DECRYPT_FAILED', 'Failed to retrieve provider credential for connection test', {
      callerUserId: userId,
      providerId,
    });
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: 'Failed to access provider credential from vault.',
      testedAt,
      durationMs: Date.now() - startTime,
    };
  }

  if (!apiKey) {
    return {
      success: false,
      code: 'AUTH_FAILED',
      message: 'No API credential configured for this provider. Please save an API key first.',
      testedAt,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Validate endpoint against SSRF allowlist
  try {
    validateProviderEndpoint(providerId, endpointConfig.url);
  } catch (error) {
    logger.warn('PROVIDER_TEST_SSRF_BLOCKED', 'Blocked disallowed endpoint destination in connection test', {
      callerUserId: userId,
      providerId,
      url: endpointConfig.url,
    });
    return {
      success: false,
      code: 'ENDPOINT_NOT_ALLOWED',
      message: (error as Error).message,
      testedAt,
      durationMs: Date.now() - startTime,
    };
  }

  // 3. Dispatch bounded HTTPS probe request with strict 5-second timeout and manual redirect handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetchImpl(endpointConfig.url, {
      method: endpointConfig.method,
      headers: endpointConfig.headers(apiKey),
      signal: controller.signal,
      redirect: 'manual', // Never silently forward authentication headers across redirects
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout =
      (err as { name?: string })?.name === 'AbortError' ||
      (err as { name?: string })?.name === 'TimeoutError';

    const code: ConnectionTestResultCode = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
    const message = isTimeout
      ? 'Connection test timed out after 5 seconds. The provider may be slow or unreachable.'
      : 'Network error communicating with provider endpoint. Please check your network connection.';

    logger.warn('PROVIDER_TEST_NETWORK_ERROR', 'Network failure during provider probe', {
      callerUserId: userId,
      providerId,
      code,
      durationMs,
    });

    // Persist failure status in configuration metadata
    await configRepo.updateTestStatus(userId, providerId, 'FAILED', new Date());

    return {
      success: false,
      code,
      message,
      testedAt,
      durationMs,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const durationMs = Date.now() - startTime;

  // 4. Classify response code safely
  let code: ConnectionTestResultCode;
  let message: string;
  let success = false;

  if (response.status >= 200 && response.status < 300) {
    success = true;
    code = 'SUCCESS';
    message = 'Connection and API key successfully verified with provider.';
  } else if (response.status === 401) {
    code = 'AUTH_FAILED';
    message = 'Authentication rejected by provider. The API key is invalid or has been revoked.';
  } else if (response.status === 403) {
    code = 'PERMISSION_DENIED';
    message = 'Permission denied. The API key lacks sufficient permissions for this provider.';
  } else if (response.status === 429) {
    code = 'RATE_LIMITED';
    message = 'Provider rate limit or quota exceeded. Please check your provider account credits.';
  } else if (response.status >= 500) {
    code = 'SERVER_ERROR';
    message = `Provider server error (HTTP ${response.status}). The upstream service may be experiencing downtime.`;
  } else {
    code = 'UNKNOWN_ERROR';
    message = `Unexpected response from provider (HTTP ${response.status}).`;
  }

  logger.info('PROVIDER_TEST_COMPLETED', 'Provider connection test completed', {
    callerUserId: userId,
    providerId,
    code,
    success,
    durationMs,
  });

  // 5. Persist outcome in database configuration metadata
  const dbStatus = success ? 'SUCCESS' : 'FAILED';
  await configRepo.updateTestStatus(userId, providerId, dbStatus, new Date());

  return {
    success,
    code,
    message,
    testedAt,
    durationMs,
  };
}
