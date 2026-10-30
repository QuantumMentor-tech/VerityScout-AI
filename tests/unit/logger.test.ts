import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, sanitizeString, sanitizeContext } from '@/lib/logging/logger';

describe('Structured Logger & Defensive Redaction (logger.ts)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('redacts sensitive keys in structured context', () => {
    const rawContext = {
      username: 'analyst1',
      password: 'plain_password_123',
      apiKey: 'sk-test12345678901234567890',
      authToken: 'Bearer eyJhbGciOiJIUzI1NiJ9.test.sig',
      databaseUrl: 'postgresql://admin:secretPass@localhost:5432/verityscout',
    };

    const sanitized = sanitizeContext(rawContext) as Record<string, unknown>;

    expect(sanitized.username).toBe('analyst1');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.authToken).toBe('[REDACTED]');
    expect(sanitized.databaseUrl).toBe('[REDACTED]');
  });

  it('sanitizes credential-shaped patterns embedded in string values', () => {
    const testCases = [
      {
        input: 'Header authorization: Bearer ya29.a0AfH6SM...token==',
        expected: 'Header authorization: Bearer [REDACTED]',
      },
      {
        input: 'Attempting connection to postgresql://user:mySecretDbPassword@db.internal:5432/app',
        expected: 'Attempting connection to postgresql://user:[REDACTED]@db.internal:5432/app',
      },
      {
        input: 'Request failed for https://api.example.com/search?q=gpu&token=secret_token_12345&mode=json',
        expected: 'Request failed for https://api.example.com/search?q=gpu&token=[REDACTED]&mode=json',
      },
      {
        input: 'Using OpenAI key sk-abcdef1234567890abcdef1234567890 for routing',
        expected: 'Using OpenAI key [REDACTED_API_KEY] for routing',
      },
    ];

    for (const { input, expected } of testCases) {
      expect(sanitizeString(input)).toBe(expected);
    }
  });

  it('neutralizes log injection by replacing newlines and carriage returns', () => {
    const maliciousInput = 'Normal log message\n{"event":"FORGED_EVENT","level":"error","admin":true}\r\nMore text';
    const sanitized = sanitizeString(maliciousInput);

    expect(sanitized).not.toContain('\n');
    expect(sanitized).not.toContain('\r');
    expect(sanitized).toBe('Normal log message {"event":"FORGED_EVENT","level":"error","admin":true} More text');
  });

  it('handles circular references gracefully without crashing', () => {
    const circularObj: Record<string, unknown> = { name: 'cyclic' };
    circularObj.self = circularObj;

    const sanitized = sanitizeContext(circularObj) as Record<string, unknown>;
    expect(sanitized.name).toBe('cyclic');
    expect(sanitized.self).toBe('[CIRCULAR_REFERENCE]');
  });

  it('respects log level thresholds', () => {
    const testLogger = new Logger('warn');

    testLogger.debug('DEBUG_EVENT', 'Should not be emitted');
    testLogger.info('INFO_EVENT', 'Should not be emitted');
    expect(stdoutSpy).not.toHaveBeenCalled();

    testLogger.warn('WARN_EVENT', 'Recoverable warning');
    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    testLogger.error('ERROR_EVENT', 'System error');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('formats output as single-line parseable JSON', () => {
    const testLogger = new Logger('info');
    testLogger.info('TEST_EVENT', 'Testing JSON output', { detail: 'active' }, 'req-999');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const loggedOutput = stdoutSpy.mock.calls[0]?.[0]?.toString() ?? '';
    expect(loggedOutput.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(loggedOutput.trim()) as {
      level: string;
      event: string;
      message: string;
      correlationId: string;
      context: { detail: string };
    };

    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('TEST_EVENT');
    expect(parsed.message).toBe('Testing JSON output');
    expect(parsed.correlationId).toBe('req-999');
    expect(parsed.context.detail).toBe('active');
  });
});
