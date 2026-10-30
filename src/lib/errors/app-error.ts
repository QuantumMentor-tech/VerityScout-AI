export type ErrorCode =
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFIG_ERROR'
  | 'RATE_LIMIT_EXCEEDED';

export interface NormalizedErrorOutput {
  readonly code: ErrorCode;
  readonly message: string;
  readonly statusCode: number;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly publicMessage: string;

  constructor(options: {
    code: ErrorCode;
    message: string;
    publicMessage?: string;
    statusCode?: number;
    isOperational?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.publicMessage = options.publicMessage ?? 'An unexpected application error occurred.';

    // Maintain V8 stack trace capture if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Normalizes any caught error into a safe, client-presentable error representation.
 * Guarantees that internal exception messages, stack traces, and database errors are never returned to clients.
 */
export function normalizeError(error: unknown): NormalizedErrorOutput {
  if (error instanceof AppError) {
    if (error.isOperational) {
      return {
        code: error.code,
        message: error.publicMessage,
        statusCode: error.statusCode,
      };
    }

    return {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An internal error occurred. Please try again later.',
      statusCode: 500,
    };
  }

  return {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
    statusCode: 500,
  };
}
