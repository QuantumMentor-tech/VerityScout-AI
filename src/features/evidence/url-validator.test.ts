import { describe, it, expect } from 'vitest';
import { validateSourceUrl } from './url-validator';

describe('validateSourceUrl helper (Step 20 Security Boundary)', () => {
  it('SOURCE-UNIT-002: permits standard https URL and extracts domain', () => {
    const result = validateSourceUrl('https://example.com/listings/thinkpad-t14-gen3-32gb');
    expect(result.isValid).toBe(true);
    expect(result.safeUrl).toBe('https://example.com/listings/thinkpad-t14-gen3-32gb');
    expect(result.domain).toBe('example.com');
    expect(result.protocol).toBe('https:');
  });

  it('permits standard http URL', () => {
    const result = validateSourceUrl('http://insecure-example.org/specs.html');
    expect(result.isValid).toBe(true);
    expect(result.safeUrl).toBe('http://insecure-example.org/specs.html');
    expect(result.domain).toBe('insecure-example.org');
  });

  it('SOURCE-UNIT-003: rejects javascript: scheme', () => {
    const result = validateSourceUrl('javascript:alert(document.cookie)');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unsupported or prohibited protocol/i);
    expect(result.safeUrl).toBeUndefined();
  });

  it('rejects data: scheme', () => {
    const result = validateSourceUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unsupported or prohibited protocol/i);
  });

  it('rejects file: scheme', () => {
    const result = validateSourceUrl('file:///etc/passwd');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/unsupported or prohibited protocol/i);
  });

  it('rejects URLs with embedded username and password credentials', () => {
    const result = validateSourceUrl('https://admin:secret123@example.com/dashboard');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/embedded authentication credentials/i);
  });

  it('rejects empty or whitespace strings', () => {
    expect(validateSourceUrl('')?.isValid).toBe(false);
    expect(validateSourceUrl('   ')?.isValid).toBe(false);
    expect(validateSourceUrl(undefined)?.isValid).toBe(false);
    expect(validateSourceUrl(null)?.isValid).toBe(false);
  });

  it('rejects completely malformed URLs', () => {
    const result = validateSourceUrl('htt\\not-a-valid-url');
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });
});
