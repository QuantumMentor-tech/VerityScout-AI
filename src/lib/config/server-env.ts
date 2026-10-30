import 'server-only';
import { z } from 'zod';

/**
 * Supported runtime environment modes.
 */
export const NodeEnvSchema = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

/**
 * Supported logging severity thresholds.
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Server environment schema validating only real, justified foundation settings.
 * Future database, search, and AI provider credentials are intentionally deferred.
 */
export const ServerEnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default('development'),
  LOG_LEVEL: LogLevelSchema.default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export class ConfigValidationError extends Error {
  public readonly invalidFields: readonly string[];

  constructor(invalidFields: string[]) {
    super(`Configuration validation failed for fields: ${invalidFields.join(', ')}`);
    this.name = 'ConfigValidationError';
    this.invalidFields = Object.freeze([...invalidFields]);
  }
}

/**
 * Pure validation function that parses an environment dictionary.
 * Does NOT echo back supplied values to prevent accidental credential leakage in error messages.
 */
export function validateServerEnv(rawEnv: Record<string, string | undefined>): ServerEnv {
  const result = ServerEnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const invalidFields = result.error.issues.map((issue) => issue.path.join('.'));
    throw new ConfigValidationError(invalidFields);
  }

  return result.data;
}

/**
 * Cached singleton instance for server runtime.
 */
let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = validateServerEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Test helper to reset cached configuration between test runs.
 */
export function _resetServerEnvCacheForTesting(): void {
  cachedEnv = null;
}
