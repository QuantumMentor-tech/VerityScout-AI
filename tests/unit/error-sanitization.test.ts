import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeContext,
} from '@/lib/logging/logger';
import {
  AppError,
  normalizeError,
} from '@/lib/errors/app-error';
import { sanitizeErrorMessage as sanitizeOpenAi } from '@/server/providers/adapters/openai/openai-mapper';
import { sanitizeErrorMessage as sanitizeNim } from '@/server/providers/adapters/nim/nim-mapper';

describe('Error & Credential Sanitization Unit Tests (Step 51)', () => {
  describe('String-Level Sanitization (sanitizeString)', () => {
    it('redacts Bearer tokens in Authorization headers and prose', () => {
      const raw = 'Request failed with header: Bearer ya29.a0AfH6SMD_randomSecretToken12345';
      const sanitized = sanitizeString(raw);

      expect(sanitized).toBe('Request failed with header: Bearer [REDACTED]');
      expect(sanitized).not.toContain('ya29.a0AfH6SMD_randomSecretToken12345');
    });

    it('redacts OpenAI-style API keys (sk-...)', () => {
      const raw = 'Invalid credentials sk-proj-1234567890abcdef1234567890 provided for org';
      const sanitized = sanitizeString(raw);

      expect(sanitized).toBe('Invalid credentials [REDACTED_API_KEY] provided for org');
      expect(sanitized).not.toContain('sk-proj-1234567890abcdef1234567890');
    });

    it('redacts JWT format tokens (ey...)', () => {
      const raw = 'Auth token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature123';
      const sanitized = sanitizeString(raw);

      expect(sanitized).toBe('Auth token: [REDACTED_JWT]');
      expect(sanitized).not.toContain('doNotLeakThisSignature123');
    });

    it('redacts embedded basic-auth credentials from URLs', () => {
      const raw = 'Connecting to postgres://admin:superSecretPassword123@db.prod.internal:5432/verityscout';
      const sanitized = sanitizeString(raw);

      expect(sanitized).toBe('Connecting to postgres://admin:[REDACTED]@db.prod.internal:5432/verityscout');
      expect(sanitized).not.toContain('superSecretPassword123');
    });

    it('redacts sensitive query parameters in URLs (?token=..., &key=...)', () => {
      const raw = 'Webhook callback https://api.service.com/hook?token=secretWebhookToken99&api_key=privKey888&action=sync';
      const sanitized = sanitizeString(raw);

      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).toContain('api_key=[REDACTED]');
      expect(sanitized).toContain('&action=sync');
      expect(sanitized).not.toContain('secretWebhookToken99');
      expect(sanitized).not.toContain('privKey888');
    });

    it('strips CRLF line breaks to prevent log injection / splitting attacks', () => {
      const raw = 'User input: Valid Query\r\n[ERROR] Fake Log Entry Injected\nAnother line';
      const sanitized = sanitizeString(raw);

      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toBe('User input: Valid Query [ERROR] Fake Log Entry Injected Another line');
    });

    it('truncates strings exceeding MAX_STRING_LENGTH (2000 chars)', () => {
      const hugeString = 'A'.repeat(2500);
      const sanitized = sanitizeString(hugeString);

      expect(sanitized.length).toBeLessThan(2050);
      expect(sanitized).toContain('...[TRUNCATED]');
    });
  });

  describe('Structured Context Sanitization (sanitizeContext)', () => {
    it('redacts sensitive object keys completely (password, secret, token, api_key)', () => {
      const context = {
        userId: 'user-456',
        password: 'PlainTextPassword123!',
        api_key: 'sk-999988887777',
        nested: {
          sessionToken: 'session-xyz',
          clientSecret: 'secret-val',
          safeParam: 'public-value',
        },
      };

      const sanitized = sanitizeContext(context) as Record<string, unknown>;

      expect(sanitized.userId).toBe('user-456');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');

      const nested = sanitized.nested as Record<string, unknown>;
      expect(nested.sessionToken).toBe('[REDACTED]');
      expect(nested.clientSecret).toBe('[REDACTED]');
      expect(nested.safeParam).toBe('public-value');
    });

    it('handles circular object references without call stack overflow', () => {
      const circularObj: Record<string, unknown> = {
        name: 'CircularTest',
      };
      circularObj.self = circularObj;

      const sanitized = sanitizeContext(circularObj) as Record<string, unknown>;
      expect(sanitized.name).toBe('CircularTest');
      expect(sanitized.self).toBe('[CIRCULAR_REFERENCE]');
    });

    it('bounds recursion depth at MAX_DEPTH (5)', () => {
      const deepObj: any = { level: 1, next: { level: 2, next: { level: 3, next: { level: 4, next: { level: 5, next: { level: 6, next: 'too deep' } } } } } };

      const sanitized = sanitizeContext(deepObj) as any;
      expect(sanitized.next.next.next.next.next.next).toBe('[EXCEEDED_MAX_DEPTH]');
    });

    it('sanitizes Error object instances in context', () => {
      const err = new Error('Database connection failed: postgres://admin:superSecretPass@db.internal:5432/verity');
      const sanitized = sanitizeContext(err) as Record<string, unknown>;

      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).not.toContain('superSecretPass');
      expect(sanitized.message).toContain('postgres://admin:[REDACTED]@db.internal:5432/verity');
    });
  });

  describe('Application Error Client Envelope Normalization (normalizeError)', () => {
    it('returns operational publicMessage for operational AppError', () => {
      const opError = new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Internal SQL syntax error near column id',
        publicMessage: 'The requested query parameters are invalid.',
        statusCode: 400,
        isOperational: true,
      });

      const output = normalizeError(opError);

      expect(output.code).toBe('VALIDATION_ERROR');
      expect(output.statusCode).toBe(400);
      expect(output.message).toBe('The requested query parameters are invalid.');
      expect(output.message).not.toContain('Internal SQL syntax error');
    });

    it('masks non-operational AppError as generic internal error', () => {
      const fatalError = new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'FATAL: database disk full on mount /var/lib/postgresql',
        isOperational: false,
      });

      const output = normalizeError(fatalError);

      expect(output.code).toBe('INTERNAL_SERVER_ERROR');
      expect(output.statusCode).toBe(500);
      expect(output.message).toBe('An internal error occurred. Please try again later.');
      expect(output.message).not.toContain('database disk full');
    });

    it('masks raw native unhandled Exceptions as generic 500 error', () => {
      const rawError = new Error('TypeError: Cannot read properties of undefined (reading secretKey)');
      const output = normalizeError(rawError);

      expect(output.code).toBe('INTERNAL_SERVER_ERROR');
      expect(output.statusCode).toBe(500);
      expect(output.message).toBe('An unexpected error occurred. Please try again later.');
      expect(output.message).not.toContain('secretKey');
    });
  });

  describe('Provider Adapter Error Sanitizer Functions', () => {
    it('scrubs OpenAI and Bearer tokens in OpenAI mapper sanitizeErrorMessage', () => {
      const message = 'Failed at upstream with token: Bearer my-secret-session-token and key sk-1234567890abcdef1234567890';
      const sanitized = sanitizeOpenAi(message);

      expect(sanitized).toBe('Failed at upstream with token: Bearer [REDACTED] and key [REDACTED_API_KEY]');
      expect(sanitized).not.toContain('my-secret-session-token');
      expect(sanitized).not.toContain('sk-1234567890abcdef1234567890');
    });

    it('scrubs NVIDIA nvapi- tokens in NIM mapper sanitizeErrorMessage', () => {
      const message = 'NVIDIA auth failure with key nvapi-abc1234567890xyz';
      const sanitized = sanitizeNim(message);

      expect(sanitized).toBe('NVIDIA auth failure with key [REDACTED_API_KEY]');
      expect(sanitized).not.toContain('nvapi-abc1234567890xyz');
    });
  });
});
