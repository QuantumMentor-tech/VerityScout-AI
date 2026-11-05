import 'server-only';
import { FailureCategory } from './error-classifier';

export interface RetryPolicyOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
};

/**
 * Calculates exponential backoff delay with full jitter for an attempt index.
 * Attempt is 1-indexed (1st retry is attempt 1).
 */
export function calculateRetryDelay(
  attempt: number,
  retryAfterSeconds?: number | undefined,
  options?: Partial<RetryPolicyOptions> | undefined
): number {
  const baseDelay = options?.baseDelayMs ?? DEFAULT_RETRY_POLICY.baseDelayMs;
  const maxDelay = options?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
  const jitterRange = options?.jitterMs ?? DEFAULT_RETRY_POLICY.jitterMs;

  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    const headerDelayMs = retryAfterSeconds * 1000;
    return Math.min(headerDelayMs, maxDelay);
  }

  const safeAttempt = Math.max(1, attempt);
  const exponential = baseDelay * Math.pow(2, safeAttempt - 1);
  const jitter = Math.floor(Math.random() * jitterRange);

  return Math.min(exponential + jitter, maxDelay);
}

/**
 * Determines whether a job failure qualifies for another retry execution.
 */
export function shouldRetry(
  attempts: number,
  maxAttempts: number = DEFAULT_RETRY_POLICY.maxAttempts,
  category: FailureCategory
): boolean {
  if (category !== 'TRANSIENT') {
    return false;
  }
  return attempts < maxAttempts;
}

