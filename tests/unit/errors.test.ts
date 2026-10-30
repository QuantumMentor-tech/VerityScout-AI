import { describe, it, expect } from 'vitest';
import { AppError, normalizeError } from '@/lib/errors/app-error';

describe('Application Error Handling & Normalization (app-error.ts)', () => {
  it('normalizes operational AppError preserving safe publicMessage and code', () => {
    const error = new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Internal parsing error: raw input failed constraint regex',
      publicMessage: 'The provided search query format is invalid.',
      statusCode: 400,
      isOperational: true,
    });

    const normalized = normalizeError(error);

    expect(normalized.code).toBe('VALIDATION_ERROR');
    expect(normalized.message).toBe('The provided search query format is invalid.');
    expect(normalized.statusCode).toBe(400);
    // Ensure raw internal message is not present in normalized output
    expect(normalized.message).not.toContain('regex');
  });

  it('masks non-operational AppError with generic internal server error', () => {
    const error = new AppError({
      code: 'CONFIG_ERROR',
      message: 'Database connection failed: password rejected for role admin',
      publicMessage: 'Should not be shown because isOperational is false',
      statusCode: 500,
      isOperational: false,
    });

    const normalized = normalizeError(error);

    expect(normalized.code).toBe('INTERNAL_SERVER_ERROR');
    expect(normalized.message).toBe('An internal error occurred. Please try again later.');
    expect(normalized.statusCode).toBe(500);
    expect(normalized.message).not.toContain('password');
  });

  it('masks standard unhandled JavaScript Error with generic error and 500 status', () => {
    const rawError = new Error('FATAL: connection to server at "10.0.0.5" failed: Connection refused');

    const normalized = normalizeError(rawError);

    expect(normalized.code).toBe('INTERNAL_SERVER_ERROR');
    expect(normalized.message).toBe('An unexpected error occurred. Please try again later.');
    expect(normalized.statusCode).toBe(500);
    expect(normalized.message).not.toContain('10.0.0.5');
  });

  it('masks unknown non-Error throws (string, null, object) safely', () => {
    const normalizedString = normalizeError('raw string exception containing secret_token_xyz');
    expect(normalizedString.code).toBe('INTERNAL_SERVER_ERROR');
    expect(normalizedString.message).toBe('An unexpected error occurred. Please try again later.');
    expect(normalizedString.message).not.toContain('secret_token_xyz');

    const normalizedNull = normalizeError(null);
    expect(normalizedNull.code).toBe('INTERNAL_SERVER_ERROR');
    expect(normalizedNull.statusCode).toBe(500);
  });
});
