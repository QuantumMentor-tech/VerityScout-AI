import 'server-only';
import { z } from 'zod';

/**
 * Supported runtime environment modes.
 */
export const NodeEnvSchema = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

/**
 * Supported application deployment environment tiers (Step 58).
 */
export const AppEnvSchema = z.enum(['development', 'staging', 'production']);
export type AppEnv = z.infer<typeof AppEnvSchema>;

/**
 * Supported logging severity thresholds.
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

const DEFAULT_DEV_VAULT_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEFAULT_DEV_DB_PASSWORD = 'verityscout_dev_password';

/**
 * Server environment schema validating only real, justified foundation settings.
 * Future database, search, and AI provider credentials are intentionally deferred.
 */
export const ServerEnvSchema = z
  .object({
    NODE_ENV: NodeEnvSchema.default('development'),
    APP_ENV: AppEnvSchema.default('development'),
    LOG_LEVEL: LogLevelSchema.default('info'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // Database Connection & Pooling (Step 22)
    DATABASE_URL: z.string().optional(),
    POSTGRES_HOST: z.string().default('127.0.0.1'),
    POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    POSTGRES_USER: z.string().default('verityscout'),
    POSTGRES_PASSWORD: z.string().default(DEFAULT_DEV_DB_PASSWORD),
    POSTGRES_DB: z.string().default('verityscout_dev'),
    POSTGRES_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DATABASE_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
    DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),

    // Provider Credential Vault Encryption (Step 25 / SEC-001, SEC-002, ADR-010)
    VAULT_MASTER_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'Must be a 64-character hex string (256-bit key)')
      .default(DEFAULT_DEV_VAULT_KEY),
    VAULT_KEYRING: z.string().optional(),
    VAULT_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).default(1),

    // Optional override for internal production VPCs lacking direct TLS termination on the container
    ALLOW_INSECURE_HTTP_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
  })
  .superRefine((data, ctx) => {
    // Production tier environment validations (AC-02, AC-04, AC-10)
    if (data.APP_ENV === 'production') {
      if (data.VAULT_MASTER_KEY === DEFAULT_DEV_VAULT_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VAULT_MASTER_KEY'],
          message: 'In production tier, VAULT_MASTER_KEY cannot use the default development key.',
        });
      }

      if (!data.DATABASE_URL && data.POSTGRES_PASSWORD === DEFAULT_DEV_DB_PASSWORD) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['POSTGRES_PASSWORD'],
          message: 'In production tier, POSTGRES_PASSWORD cannot use the default development password.',
        });
      }

      const isLoopback =
        data.APP_URL.includes('localhost') ||
        data.APP_URL.includes('127.0.0.1') ||
        data.APP_URL.includes('0.0.0.0');

      if (isLoopback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_URL'],
          message: 'In production tier, APP_URL must be a public domain and cannot be localhost or loopback.',
        });
      }

      if (!data.APP_URL.startsWith('https://') && !data.ALLOW_INSECURE_HTTP_IN_PRODUCTION) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_URL'],
          message: 'In production tier, APP_URL must use HTTPS protocol.',
        });
      }
    }

    // Staging tier environment validations (AC-02, AC-05)
    if (data.APP_ENV === 'staging') {
      const isLoopback =
        data.APP_URL.includes('localhost') ||
        data.APP_URL.includes('127.0.0.1') ||
        data.APP_URL.includes('0.0.0.0');

      if (isLoopback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_URL'],
          message: 'In staging tier, APP_URL must point to a staging environment and cannot be localhost.',
        });
      }
    }
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
