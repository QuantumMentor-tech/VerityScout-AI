import { EMPTY_QUERY_ERROR, MAX_QUERY_LENGTH, OVER_LIMIT_ERROR } from './constants';
import type { ValidationResult } from './types';

/**
 * Deterministically validates a user research query string.
 *
 * Rules:
 * 1. Rejects empty strings and whitespace-only text.
 * 2. Enforces maximum character boundary of 1,000 characters.
 * 3. Preserves original text formatting while providing trimmed normalized version.
 */
export function validateQuery(rawQuery: string): ValidationResult {
  const normalizedQuery = rawQuery.trim();

  if (!normalizedQuery) {
    return {
      isValid: false,
      error: EMPTY_QUERY_ERROR,
      normalizedQuery: '',
    };
  }

  if (rawQuery.length > MAX_QUERY_LENGTH) {
    return {
      isValid: false,
      error: OVER_LIMIT_ERROR,
      normalizedQuery,
    };
  }

  return {
    isValid: true,
    normalizedQuery,
  };
}
