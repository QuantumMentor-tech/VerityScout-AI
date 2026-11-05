import 'server-only';

export type FailureCategory = 'TRANSIENT' | 'PERMANENT' | 'CANCELLED';

export interface ErrorClassification {
  readonly category: FailureCategory;
  readonly isRetryable: boolean;
  readonly reason: string;
  readonly statusCode?: number | undefined;
  readonly retryAfterSeconds?: number | undefined;
}

export class CancellationRequestedError extends Error {
  constructor(message: string = 'Execution was cancelled by user request') {
    super(message);
    this.name = 'CancellationRequestedError';
  }
}

/**
 * Classifies an error into TRANSIENT (retryable), PERMANENT (fatal), or CANCELLED.
 */
export function classifyError(error: unknown): ErrorClassification {
  if (!error) {
    return {
      category: 'PERMANENT',
      isRetryable: false,
      reason: 'Unknown error occurred with empty payload',
    };
  }

  // 1. Explicit cancellation error
  if (
    error instanceof CancellationRequestedError ||
    (error instanceof Error && error.name === 'CancellationRequestedError')
  ) {
    return {
      category: 'CANCELLED',
      isRetryable: false,
      reason: 'Execution was cancelled by user request',
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  // Check if cancellation is indicated in the error message
  if (
    lowerMsg.includes('cancelled by user') ||
    lowerMsg.includes('cancellation requested') ||
    lowerMsg.includes('operation cancelled')
  ) {
    return {
      category: 'CANCELLED',
      isRetryable: false,
      reason: message,
    };
  }

  // 2. HTTP Status checks if present on error object
  const statusCode =
    typeof (error as Record<string, unknown>).statusCode === 'number'
      ? ((error as Record<string, unknown>).statusCode as number)
      : typeof (error as Record<string, unknown>).status === 'number'
      ? ((error as Record<string, unknown>).status as number)
      : undefined;

  const retryAfter =
    typeof (error as Record<string, unknown>).retryAfterSeconds === 'number'
      ? ((error as Record<string, unknown>).retryAfterSeconds as number)
      : undefined;

  if (statusCode !== undefined) {
    if (statusCode === 429) {
      return {
        category: 'TRANSIENT',
        isRetryable: true,
        reason: `Rate limit encountered (HTTP 429): ${message}`,
        statusCode,
        retryAfterSeconds: retryAfter,
      };
    }

    if ([502, 503, 504].includes(statusCode)) {
      return {
        category: 'TRANSIENT',
        isRetryable: true,
        reason: `Upstream service unavailable (HTTP ${statusCode}): ${message}`,
        statusCode,
        retryAfterSeconds: retryAfter,
      };
    }

    if ([400, 401, 403, 404, 422].includes(statusCode)) {
      return {
        category: 'PERMANENT',
        isRetryable: false,
        reason: `Client or authorization error (HTTP ${statusCode}): ${message}`,
        statusCode,
      };
    }
  }

  // 3. Known transient network patterns
  const transientPatterns = [
    'econnreset',
    'econnrefused',
    'etimedout',
    'enotfound',
    'eai_again',
    'fetch failed',
    'network error',
    'socket hang up',
    'timeout',
    'deadline exceeded',
    'rate limit',
    'too many requests',
    'gateway timeout',
    'service unavailable',
    'bad gateway',
    'connection terminated unexpectedly',
  ];

  for (const pattern of transientPatterns) {
    if (lowerMsg.includes(pattern)) {
      return {
        category: 'TRANSIENT',
        isRetryable: true,
        reason: `Transient network or upstream failure: ${message}`,
        statusCode,
        retryAfterSeconds: retryAfter,
      };
    }
  }

  // 4. Known permanent validation / input patterns
  const permanentPatterns = [
    'validation error',
    'invalid input',
    'unauthorized',
    'forbidden',
    'invalid api key',
    'model not found',
    'cannot parse',
    'unsupported provider',
    'syntax error',
  ];

  for (const pattern of permanentPatterns) {
    if (lowerMsg.includes(pattern)) {
      return {
        category: 'PERMANENT',
        isRetryable: false,
        reason: `Non-retryable input or configuration failure: ${message}`,
        statusCode,
      };
    }
  }

  // Default fallback: Default to PERMANENT to prevent unbounded loops on novel bugs,
  // unless explicitly matching transient cues.
  return {
    category: 'PERMANENT',
    isRetryable: false,
    reason: `Unhandled non-retryable failure: ${message}`,
    statusCode,
  };
}

