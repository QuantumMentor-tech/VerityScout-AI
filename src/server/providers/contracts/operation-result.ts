/**
 * VerityScout AI — Normalized Operation Results & Error Contracts
 * Governed by: Step 27 (Common AI Provider Interfaces, Model Contracts, Capability Metadata, and Provider Registry)
 *
 * Architectural Rules:
 * 1. Discriminated union: { success: true, data } | { success: false, error }.
 * 2. Standardized error taxonomy preserves semantic meaning without leaking secrets.
 * 3. Explicit retryability semantics backed by verifiable failure modes.
 */

import type { AiProviderId } from './provider-id';

export type ProviderErrorCode =
  | 'INVALID_PROVIDER_CONFIG'
  | 'MISSING_CREDENTIAL'
  | 'AUTH_FAILED'
  | 'PERMISSION_DENIED'
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'CANCELLED'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface ProviderError {
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly providerId: AiProviderId;
  readonly isRetryable: boolean;
  readonly httpStatus?: number;
  readonly correlationId?: string;
  readonly internalDiagnosticCode?: string;
}

export type ProviderOperationResult<T> =
  | { readonly success: true; readonly data: T; readonly latencyMs: number }
  | { readonly success: false; readonly error: ProviderError; readonly latencyMs: number };

/**
 * Determines whether an error code represents a transient, retryable condition.
 */
export function isRetryableErrorCode(code: ProviderErrorCode): boolean {
  switch (code) {
    case 'RATE_LIMITED':
    case 'PROVIDER_UNAVAILABLE':
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return true;
    case 'INSUFFICIENT_CREDITS':
    case 'AUTH_FAILED':
    case 'PERMISSION_DENIED':
    case 'INVALID_PROVIDER_CONFIG':
    case 'MISSING_CREDENTIAL':
    case 'UNSUPPORTED_CAPABILITY':
    case 'UNSUPPORTED_OPERATION':
    case 'INVALID_REQUEST':
    case 'MODEL_UNAVAILABLE':
    case 'INVALID_PROVIDER_RESPONSE':
    case 'CANCELLED':
    case 'UNKNOWN_PROVIDER_ERROR':
    default:
      return false;
  }
}

/**
 * Creates a sanitized, non-secret ProviderError object.
 */
export function createProviderError(params: {
  code: ProviderErrorCode;
  message: string;
  providerId: AiProviderId;
  httpStatus?: number;
  correlationId?: string;
  internalDiagnosticCode?: string;
  isRetryableOverride?: boolean;
}): ProviderError {
  const isRetryable =
    params.isRetryableOverride !== undefined
      ? params.isRetryableOverride
      : isRetryableErrorCode(params.code);

  return {
    code: params.code,
    message: params.message,
    providerId: params.providerId,
    isRetryable,
    ...(params.httpStatus !== undefined ? { httpStatus: params.httpStatus } : {}),
    ...(params.correlationId ? { correlationId: params.correlationId } : {}),
    ...(params.internalDiagnosticCode
      ? { internalDiagnosticCode: params.internalDiagnosticCode }
      : {}),
  };
}

export function createSuccessResult<T>(data: T, latencyMs: number): ProviderOperationResult<T> {
  return {
    success: true,
    data,
    latencyMs: Math.max(0, latencyMs),
  };
}

export function createErrorResult<T = never>(
  error: ProviderError,
  latencyMs: number
): ProviderOperationResult<T> {
  return {
    success: false,
    error,
    latencyMs: Math.max(0, latencyMs),
  };
}
