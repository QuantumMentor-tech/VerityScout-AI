import { describe, it, expect } from 'vitest';
import { validateServerEnv, ConfigValidationError } from '@/lib/config/server-env';

describe('Server Environment Validation (server-env.ts)', () => {
  it('applies default configuration when optional values are omitted', () => {
    const config = validateServerEnv({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.APP_URL).toBe('http://localhost:3000');
    expect(config.PORT).toBe(3000);
  });

  it('correctly accepts and validates explicit valid configuration', () => {
    const config = validateServerEnv({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      APP_URL: 'https://verityscout.example.com',
      PORT: '8080',
    });
    expect(config.NODE_ENV).toBe('production');
    expect(config.LOG_LEVEL).toBe('warn');
    expect(config.APP_URL).toBe('https://verityscout.example.com');
    expect(config.PORT).toBe(8080);
  });

  it('rejects invalid NODE_ENV with ConfigValidationError', () => {
    expect(() => {
      validateServerEnv({ NODE_ENV: 'staging' });
    }).toThrow(ConfigValidationError);
  });

  it('rejects invalid LOG_LEVEL with ConfigValidationError', () => {
    expect(() => {
      validateServerEnv({ LOG_LEVEL: 'verbose' });
    }).toThrow(ConfigValidationError);
  });

  it('rejects malformed APP_URL with ConfigValidationError', () => {
    expect(() => {
      validateServerEnv({ APP_URL: 'not-a-valid-url' });
    }).toThrow(ConfigValidationError);
  });

  it('rejects out-of-range port numbers', () => {
    expect(() => {
      validateServerEnv({ PORT: '70000' });
    }).toThrow(ConfigValidationError);
  });

  it('does NOT echo supplied sensitive value in error message', () => {
    const secretValue = 'super_secret_unauthorized_token_12345';
    try {
      validateServerEnv({ LOG_LEVEL: secretValue });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const message = (err as Error).message;
      expect(message).not.toContain(secretValue);
      expect(message).toContain('LOG_LEVEL');
    }
  });
});
