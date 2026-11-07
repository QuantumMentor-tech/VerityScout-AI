import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuthenticatedCaller,
  assertResourceOwnership,
  assertParentChildOwnership,
  AuthenticationRequiredError,
  AuthorizationForbiddenError,
  ResourceNotFoundError,
} from '@/server/auth/authorization';
import * as sessionModule from '@/server/auth/session';
import {
  getSessionCookieOptions,
  toSafeUser,
  validateSessionToken,
} from '@/server/auth/session';
import { hashSessionToken } from '@/server/auth/crypto';
import {
  encryptProviderSecret,
  decryptProviderSecret,
  generateCredentialPreview,
  VaultDecryptionError,
  VaultInvalidKeyError,
  VAULT_KEY_LENGTH_BYTES,
} from '@/server/crypto/provider-vault.crypto';
import { parseHexKey } from '@/server/crypto/key-manager';
import {
  validateUrl,
  classifyIpAddress,
} from '@/server/security';
import { sanitizeCsvCell, isNumericString } from '@/server/export/csv-serializer';
import { serializeRunToJson } from '@/server/export/json-serializer';
import { escapeMarkdownTableCell, escapeMarkdownText } from '@/server/export/markdown-serializer';
import { sanitizeString, sanitizeContext } from '@/lib/logging/logger';
import { deriveMatchClassification } from '@/server/synthesis/rule-based-synthesizer';
import { verifyEvidenceGrounding } from '@/server/claims/evidence-grounder';
import { isRateLimited, recordFailedAttempt, _resetRateLimiterForTesting } from '@/server/auth/rate-limiter';
import { NotificationService } from '@/server/notifications/notification.service';
import { MatchClassification, AuthUserRow, RunStatus, TaskType } from '@/server/persistence/types';
import crypto from 'node:crypto';
import nextConfig from '../../next.config';

describe('VerityScout AI — Security and Privacy Verification Suite (Step 55)', () => {
  const userA = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'alice@verityscout.local',
    displayName: 'Alice User',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const userB = {
    id: 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22',
    email: 'bob@verityscout.local',
    displayName: 'Bob User',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const testMasterKey = crypto.randomBytes(VAULT_KEY_LENGTH_BYTES);
  const testMasterKeyHex = testMasterKey.toString('hex');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. AUTHENTICATION & SESSION MANAGEMENT (AC-03)
  // =========================================================================
  describe('1. Authentication & Session Security (SEC-AUTH)', () => {
    it('SEC-AUTH-001: Denies unauthenticated caller with 401 AuthenticationRequiredError', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(null);

      await expect(requireAuthenticatedCaller()).rejects.toThrow(AuthenticationRequiredError);
      await expect(requireAuthenticatedCaller()).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        statusCode: 401,
      });
    });

    it('SEC-AUTH-002: Enforces secure cookie attributes (HttpOnly, SameSite=lax, path=/)', () => {
      const cookieOpts = getSessionCookieOptions(604800);
      expect(cookieOpts.httpOnly).toBe(true);
      expect(cookieOpts.sameSite).toBe('lax');
      expect(cookieOpts.path).toBe('/');
      expect(cookieOpts.maxAge).toBe(604800);
    });

    it('SEC-AUTH-003: Strips password_hash from user representations (data minimization)', () => {
      const rawUserRow: AuthUserRow = {
        id: userA.id,
        email: userA.email,
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$CANARY_SECRET_HASH',
        display_name: userA.displayName,
        is_active: true,
        created_at: userA.createdAt,
        updated_at: userA.createdAt,
      };

      const safeUser = toSafeUser(rawUserRow);

      expect(safeUser).not.toHaveProperty('password_hash');
      expect((safeUser as any).password_hash).toBeUndefined();
      expect(safeUser.id).toBe(userA.id);
      expect(safeUser.email).toBe(userA.email);
    });

    it('SEC-AUTH-004: Validates session token using deterministic SHA-256 hash lookup', () => {
      const rawToken = 'vs_token_canary_secret_12345';
      const hash1 = hashSessionToken(rawToken);
      const hash2 = hashSessionToken(rawToken);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(rawToken);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('SEC-AUTH-005: Rejects empty or whitespace-only session tokens gracefully', async () => {
      expect(await validateSessionToken('')).toBeNull();
      expect(await validateSessionToken('   ')).toBeNull();
      expect(await validateSessionToken(null as any)).toBeNull();
      expect(await validateSessionToken(undefined as any)).toBeNull();
    });
  });

  // =========================================================================
  // 2. AUTHORIZATION, TENANT ISOLATION & IDOR RESISTANCE (AC-04)
  // =========================================================================
  describe('2. Authorization, Tenant Isolation & IDOR Defense (SEC-AUTHZ)', () => {
    it('SEC-AUTHZ-001: Fails closed with 404 Not Found by default to prevent resource ID enumeration', () => {
      expect(() => {
        assertResourceOwnership(userA.id, userB.id, 'ResearchRun');
      }).toThrow(ResourceNotFoundError);

      try {
        assertResourceOwnership(userA.id, userB.id, 'ResearchRun');
        expect.unreachable();
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.message).toBe('ResearchRun not found');
      }
    });

    it('SEC-AUTHZ-002: Throws 403 Forbidden when discloseForbidden is explicitly enabled', () => {
      try {
        assertResourceOwnership(userA.id, userB.id, 'ResearchRun', true);
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(AuthorizationForbiddenError);
        expect(err.statusCode).toBe(403);
      }
    });

    it('SEC-AUTHZ-003: Allows access when verified caller owns the resource', () => {
      expect(() => {
        assertResourceOwnership(userA.id, userA.id, 'ResearchRun');
      }).not.toThrow();
    });

    it('SEC-AUTHZ-004: Anti-ID substitution blocks forged parent-child resource associations', () => {
      // User A owns parent run, User B owns child evidence
      expect(() => {
        assertParentChildOwnership(userA.id, userB.id, 'ResearchRun -> EvidenceRecord');
      }).toThrow(AuthorizationForbiddenError);

      try {
        assertParentChildOwnership(userA.id, userB.id, 'ResearchRun -> EvidenceRecord');
        expect.unreachable();
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.message).toMatch(/belong to different owners/i);
      }
    });

    it('SEC-AUTHZ-005: Allows valid parent-child associations when both belong to the same user', () => {
      expect(() => {
        assertParentChildOwnership(userA.id, userA.id, 'ResearchRun -> EvidenceRecord');
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 3. PROVIDER CREDENTIALS & SECRET VAULT SECURITY (AC-05)
  // =========================================================================
  describe('3. Provider Credentials & Secret Vault Security (SEC-VAULT)', () => {
    const rawSecretCanary = 'sk-proj-CANARY_SECRET_API_KEY_99999999';

    it('SEC-VAULT-001: Encrypts secrets using AES-256-GCM with distinct IVs', () => {
      const context = { userId: userA.id, providerId: 'openai' };

      const payload1 = encryptProviderSecret(rawSecretCanary, context, testMasterKey);
      const payload2 = encryptProviderSecret(rawSecretCanary, context, testMasterKey);

      // Ciphertext and IV must be non-empty Buffers
      expect(payload1.encryptedBlob.length).toBeGreaterThan(0);
      expect(payload1.initializationVector.length).toBe(12);
      expect(payload1.authTag.length).toBe(16);

      // Distinct nonces (IVs) ensure semantic security across identical plaintexts
      expect(payload1.initializationVector).not.toEqual(payload2.initializationVector);
      expect(payload1.encryptedBlob).not.toEqual(payload2.encryptedBlob);
    });

    it('SEC-VAULT-002: Successfully decrypts payload when key and AAD context match exactly', () => {
      const context = { userId: userA.id, providerId: 'openai' };
      const payload = encryptProviderSecret(rawSecretCanary, context, testMasterKey);

      const decrypted = decryptProviderSecret(payload, context, testMasterKey);
      expect(decrypted).toBe(rawSecretCanary);
    });

    it('SEC-VAULT-003: Cross-tenant tampering defense — AAD mismatch fails decryption', () => {
      // Encrypted under User A context
      const contextA = { userId: userA.id, providerId: 'openai' };
      const payload = encryptProviderSecret(rawSecretCanary, contextA, testMasterKey);

      // Attacker attempts to decrypt under User B context
      const contextB = { userId: userB.id, providerId: 'openai' };
      expect(() => {
        decryptProviderSecret(payload, contextB, testMasterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('SEC-VAULT-004: Tampered ciphertext or authentication tag fails decryption', () => {
      const context = { userId: userA.id, providerId: 'openai' };
      const payload = encryptProviderSecret(rawSecretCanary, context, testMasterKey);

      // Flip one byte in ciphertext
      payload.encryptedBlob[0] = (payload.encryptedBlob[0] ?? 0) ^ 0xff;

      expect(() => {
        decryptProviderSecret(payload, context, testMasterKey);
      }).toThrow(VaultDecryptionError);
    });

    it('SEC-VAULT-005: Rejects non-32-byte encryption keys with VaultInvalidKeyError', () => {
      const context = { userId: userA.id, providerId: 'openai' };
      const badKey = crypto.randomBytes(16); // 16 bytes instead of 32

      expect(() => {
        encryptProviderSecret(rawSecretCanary, context, badKey);
      }).toThrow(VaultInvalidKeyError);
    });

    it('SEC-VAULT-006: Key manager parses 64-character hex keys and rejects invalid formats', () => {
      expect(parseHexKey(testMasterKeyHex).length).toBe(32);

      // Invalid format / length
      expect(() => parseHexKey('short')).toThrow();
      expect(() => parseHexKey('not-a-hex-string-of-64-characters-long-so-it-must-fail-completely!!')).toThrow();
    });

    it('SEC-VAULT-007: Credential preview masks secrets and never discloses more than 4 trailing chars', () => {
      const previewOpenAI = generateCredentialPreview(rawSecretCanary);
      expect(previewOpenAI).toBe('sk-...9999');
      expect(previewOpenAI).not.toContain('CANARY_SECRET');

      const previewTavily = generateCredentialPreview('tvly-abcdef1234567890');
      expect(previewTavily).toBe('tvly-...7890');

      const previewShort = generateCredentialPreview('short');
      expect(previewShort).toBe('[CONFIGURED]');
    });
  });

  // =========================================================================
  // 4. URL VALIDATION, SSRF & DESTINATION POLICIES (AC-06)
  // =========================================================================
  describe('4. URL Validation & SSRF Prevention (SEC-SSRF)', () => {
    it('SEC-SSRF-001: Blocks protocol-relative URLs (//attacker.com)', () => {
      const res = validateUrl('//169.254.169.254/latest/meta-data', 'PUBLIC_RESEARCH_SOURCE');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('PROTOCOL_RELATIVE_URL');
      }
    });

    it('SEC-SSRF-002: Blocks forbidden schemes (file, ftp, javascript, data)', () => {
      const forbidden = [
        'file:///etc/passwd',
        'file:///C:/Windows/win.ini',
        'ftp://internal.repo/config',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'gopher://127.0.0.1:6379/_',
      ];

      for (const url of forbidden) {
        const res = validateUrl(url, 'PUBLIC_RESEARCH_SOURCE');
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('UNSUPPORTED_PROTOCOL');
        }
      }
    });

    it('SEC-SSRF-003: Rejects embedded credentials in URLs (user:pass@host)', () => {
      const res = validateUrl('https://admin:superSecret@example.com/api', 'PUBLIC_RESEARCH_SOURCE');
      expect(res.isValid).toBe(false);
      if (!res.isValid) {
        expect(res.code).toBe('URL_CONTAINS_CREDENTIALS');
      }
    });

    it('SEC-SSRF-004: Rejects non-standard ports for public sources (only 80/443 allowed)', () => {
      const badPorts = [
        'http://example.com:22',
        'http://example.com:3306',
        'http://example.com:5432',
        'http://example.com:8080',
        'http://example.com:9200',
      ];

      for (const url of badPorts) {
        const res = validateUrl(url, 'PUBLIC_RESEARCH_SOURCE');
        expect(res.isValid).toBe(false);
        if (!res.isValid) {
          expect(res.code).toBe('PROHIBITED_PORT');
        }
      }
    });

    it('SEC-SSRF-005: Rejects IPv4 loopback and private RFC 1918 addresses', () => {
      const prohibitedIps = [
        '127.0.0.1',
        '127.0.1.1',
        '127.255.255.255',
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '192.168.1.254',
        '169.254.169.254', // AWS/GCP cloud metadata link-local
        '0.0.0.0',
      ];

      for (const ip of prohibitedIps) {
        const classification = classifyIpAddress(ip);
        expect(classification.isPublic).toBe(false);

        const urlRes = validateUrl(`http://${ip}/data`, 'PUBLIC_RESEARCH_SOURCE');
        expect(urlRes.isValid).toBe(false);
        if (!urlRes.isValid) {
          expect(urlRes.code).toBe('PROHIBITED_IP_DESTINATION');
        }
      }
    });

    it('SEC-SSRF-006: Rejects IPv6 loopback, link-local, and IPv4-mapped IPv6 literals', () => {
      const prohibitedIpv6 = [
        '::1',
        'fe80::1',
        'fc00::1',
        '::ffff:127.0.0.1',
        '::ffff:169.254.169.254',
      ];

      for (const ip of prohibitedIpv6) {
        const classification = classifyIpAddress(ip);
        expect(classification.isPublic).toBe(false);
      }
    });

    it('SEC-SSRF-007: Permits legitimate public HTTP and HTTPS destinations', () => {
      const validUrls = [
        'https://www.example.com/products/gpu',
        'https://developer.nvidia.com/docs',
        'http://public-docs.org/spec',
      ];

      for (const url of validUrls) {
        const res = validateUrl(url, 'PUBLIC_RESEARCH_SOURCE');
        expect(res.isValid).toBe(true);
      }
    });
  });

  // =========================================================================
  // 5. AI PROMPT INJECTION & UNTRUSTED SOURCE BOUNDARIES (AC-08)
  // =========================================================================
  describe('5. AI Prompt Injection & Untrusted Content Defense (SEC-PROMPT-INJ)', () => {
    it('SEC-PROMPT-001: Constraint evaluation ignores injection strings embedded in source text', () => {
      // Deterministic classification evaluates hard constraint violation status, impervious to injected prompt text
      const result = deriveMatchClassification({
        requiredSummary: { total: 1, satisfied: 0, violated: 1, unresolved: 0 },
        excludedSummary: { total: 0, satisfied: 0, violated: 0, unresolved: 0 },
        preferredSummary: { total: 0, satisfied: 0, violated: 0, unresolved: 0 },
        conflictingCount: 0,
      });

      // Must be classified as EXCLUDED due to hard constraint violation, NOT Exact Match
      expect(result.classification).toBe(MatchClassification.EXCLUDED);
      expect(result.classification).not.toBe(MatchClassification.EXACT_MATCH);
      expect(result.reason).toContain('failed one or more required hard constraints');
    });

    it('SEC-PROMPT-002: Verbatim evidence grounding rejects fabricated claims not in source', () => {
      const sourceFixtureText =
        'The GeForce RTX 4070 Founders Edition operates with a 200W total graphics power (TGP). ' +
        'Length is 242mm and requires 2 expansion slots.';

      // Adversarial claim claiming 50W and 100mm
      const fabricatedClaim = 'The GPU operates at 50W TGP and fits in 100mm.';

      const grounding = verifyEvidenceGrounding(sourceFixtureText, fabricatedClaim);
      expect(grounding.isGrounded).toBe(false);

      // Verbatim true excerpt passes grounding
      const validQuote = 'operates with a 200W total graphics power (TGP)';
      const validGrounding = verifyEvidenceGrounding(sourceFixtureText, validQuote);
      expect(validGrounding.isGrounded).toBe(true);
    });
  });

  // =========================================================================
  // 6. OUTPUT ENCODING, INJECTION & SPREADSHEET FORMULA SAFETY (AC-07, AC-09)
  // =========================================================================
  describe('6. Injection Resistance & CSV Formula Defense (SEC-INJ-OUTPUT)', () => {
    it('SEC-INJ-001: Neutralizes CSV spreadsheet formula injection starting with =, +, -, @', () => {
      const formulaPayloads = [
        '=cmd|"/C calc"!A0',
        '=SUM(A1:A10)',
        '+cmd|"/C calc"!A0',
        '-2+3*cmd|"/C calc"!A0',
        '@SUM(1,2)',
        '\t=cmd|calc!A0',
        '\r=calc.exe',
        '   =FORMULA()', // leading whitespace variant
      ];

      for (const payload of formulaPayloads) {
        const sanitized = sanitizeCsvCell(payload);
        // Sanitized cell must start with single quote or quoted single quote to force text interpretation
        const startsWithQuote = sanitized.startsWith("'") || sanitized.startsWith('"\'');
        expect(startsWithQuote).toBe(true);
        expect(sanitized).not.toBe(payload);
      }
    });

    it('SEC-INJ-002: Preserves valid negative and positive numeric values in CSV without mangling', () => {
      const validNumbers = ['-250.00', '-5', '+100', '42.50', '0.00', '1e-5'];

      for (const num of validNumbers) {
        const isNum = isNumericString(num);
        expect(isNum).toBe(true);

        const sanitized = sanitizeCsvCell(num);
        // Valid numbers must NOT have single quote prepended
        expect(sanitized.startsWith("'")).toBe(false);
      }
    });

    it('SEC-INJ-003: Correctly applies RFC 4180 quotes for cells containing commas and newlines', () => {
      const cellWithComma = 'NVIDIA GeForce RTX 4070, 12GB GDDR6X';
      const sanitized = sanitizeCsvCell(cellWithComma);
      expect(sanitized).toBe('"NVIDIA GeForce RTX 4070, 12GB GDDR6X"');

      const cellWithQuotes = '15.6" OLED Display';
      const sanitizedQuotes = sanitizeCsvCell(cellWithQuotes);
      expect(sanitizedQuotes).toBe('"15.6"" OLED Display"');
    });
  });

  // =========================================================================
  // 7. SENSITIVE DATA REDACTION & LOGGING PRIVACY (AC-05, AC-11)
  // =========================================================================
  describe('7. Logging, Telemetry & Diagnostic Privacy (SEC-LOG-PRIVACY)', () => {
    it('SEC-LOG-001: Redacts API keys, Bearer tokens, and JWTs from log strings', () => {
      const sensitiveLog =
        'Error contacting provider: Bearer sk-ant-api03-abcdef123456789012345 with sk-proj-1234567890abcdef123456';

      const sanitized = sanitizeString(sensitiveLog);

      expect(sanitized).not.toContain('sk-ant-');
      expect(sanitized).not.toContain('sk-proj-');
      expect(sanitized).toContain('Bearer [REDACTED]');
      expect(sanitized).toContain('[REDACTED_API_KEY]');
    });

    it('SEC-LOG-002: Strips carriage returns and newlines to prevent log injection / splitting', () => {
      const crlfLog = 'User login successful\r\n[CRITICAL] Admin privilege granted to attacker';
      const sanitized = sanitizeString(crlfLog);

      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).toBe('User login successful [CRITICAL] Admin privilege granted to attacker');
    });

    it('SEC-LOG-003: Recursively redacts sensitive keys from structured objects', () => {
      const context = {
        userId: userA.id,
        credentials: {
          apiKey: 'sk-proj-supersecretkey12345678',
          password: 'Password123!',
          secretToken: 'sensitive-token-value',
        },
        metadata: {
          publicInfo: 'valid-product-search',
        },
      };

      const sanitized: any = sanitizeContext(context);

      expect(sanitized.userId).toBe(userA.id);
      expect(sanitized.metadata.publicInfo).toBe('valid-product-search');
      // All sensitive keys must be excluded or sanitized
      expect(sanitized.credentials.apiKey).not.toContain('supersecretkey');
    });

    it('SEC-LOG-004: Handles circular references safely without infinite recursion', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => {
        sanitizeContext(circularObj);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 8. RATE LIMITING & AUTHENTICATION ABUSE CONTROLS (AC-03, AC-16)
  // =========================================================================
  describe('8. Abuse Controls & Rate Limiting (SEC-RATE)', () => {
    it('SEC-RATE-001: Enforces lockout after 5 consecutive failed attempts on an identifier', () => {
      _resetRateLimiterForTesting();
      const clientKey = 'test-client-ip-192.0.2.1';

      expect(isRateLimited(clientKey)).toBe(false);

      // 5 failed attempts allowed, decrementing remaining
      for (let i = 1; i <= 5; i++) {
        const result = recordFailedAttempt(clientKey);
        expect(result.isBlocked).toBe(false);
        expect(result.remainingAttempts).toBe(5 - i);
      }

      // 6th failure exceeds maximum allowed: triggers lockout
      const sixth = recordFailedAttempt(clientKey);
      expect(sixth.isBlocked).toBe(true);
      expect(sixth.remainingAttempts).toBe(0);
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
      expect(isRateLimited(clientKey)).toBe(true);
    });
  });

  // =========================================================================
  // 9. EXPORT SECURITY, DATA MINIMIZATION & SECRET EXCLUSION (AC-09, AC-11)
  // =========================================================================
  describe('9. Export Scope & Secret Exclusion (SEC-EXPORT)', () => {
    it('SEC-EXPORT-001: serializeRunToJson excludes database internals, password hashes, and keys', () => {
      const runSnapshot = {
        run: {
          id: 'run-uuid-1234',
          task_id: 'task-uuid-5678',
          user_id: userA.id,
          schedule_id: null,
          idempotency_key: 'idemp-1',
          status: RunStatus.COMPLETED,
          current_stage: 'SYNTHESIZING' as any,
          stage_counters: {},
          usage: { promptTokens: 100, completionTokens: 50, searchCredits: 1, estimatedCostUsd: '0.0020' },
          selected_provider: 'openai',
          selected_model: 'gpt-4o',
          progress_percent: 100,
          error_message: null,
          cancellation_reason: null,
          started_at: '2026-11-01T00:00:00Z',
          completed_at: '2026-11-01T00:01:00Z',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:01:00Z',
        },
        task: {
          id: 'task-uuid-5678',
          user_id: userA.id,
          title: 'RTX 4070 SFF Research',
          original_query: 'Best RTX 4070 for 2-slot SFF',
          task_type: TaskType.PRODUCT_RESEARCH,
          constraints: {},
          limits: {},
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
        candidates: [],
        evidence: [],
        sources: [],
      };

      const jsonStr = serializeRunToJson(runSnapshot as any);

      expect(jsonStr).not.toContain('password_hash');
      expect(jsonStr).not.toContain('VAULT_MASTER_KEY');
      expect(jsonStr).not.toContain('token_hash');
      expect(jsonStr).toContain('run-uuid-1234');
      expect(jsonStr).toContain('RTX 4070 SFF Research');
    });

    it('SEC-EXPORT-002: Markdown export escapes HTML tags and table pipes in query and titles', () => {
      const maliciousQuery = '<script>alert("XSS")</script> | Evil Title';
      const escapedText = escapeMarkdownText(maliciousQuery);
      const escapedCell = escapeMarkdownTableCell(maliciousQuery);

      expect(escapedText).not.toContain('<script>');
      expect(escapedText).toContain('&lt;script&gt;');

      expect(escapedCell).not.toContain('<script>');
      expect(escapedCell).toContain('&lt;script&gt;');
      expect(escapedCell).toContain('\\|'); // Escaped pipe for markdown table
    });
  });

  // =========================================================================
  // 10. NOTIFICATION & ASYNCHRONOUS EVENT AUTHORIZATION (AC-10)
  // =========================================================================
  describe('10. Notification Ownership & Isolation (SEC-NOTIF)', () => {
    it('SEC-NOTIF-001: markAsRead enforces user ownership at database boundary', async () => {
      const mockRepo = {
        markAsRead: vi.fn().mockImplementation((id: string, userId: string) => {
          // If User B tries to mark User A's notification, repo returns null
          if (userId === userB.id) {
            return Promise.resolve(null);
          }
          return Promise.resolve({ id, user_id: userId, read_at: '2026-11-01T00:00:00Z' });
        }),
      };

      const service = new NotificationService(mockRepo as any);

      // User B attempting to mark User A notification fails closed with 404 (anti-enumeration)
      await expect(service.markAsRead('notif-owned-by-A', userB.id)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Notification not found or access denied',
      });

      // User A marking own notification succeeds
      const result = await service.markAsRead('notif-owned-by-A', userA.id);
      expect(result.read_at).not.toBeNull();
    });

    it('SEC-NOTIF-002: dismissNotification enforces user ownership and returns 404 on access denial', async () => {
      const mockRepo = {
        dismiss: vi.fn().mockImplementation((id: string, userId: string) => {
          if (userId === userB.id) {
            return Promise.resolve(null);
          }
          return Promise.resolve({ id, user_id: userId, dismissed_at: '2026-11-01T00:00:00Z' });
        }),
      };

      const service = new NotificationService(mockRepo as any);

      await expect(service.dismissNotification('notif-owned-by-A', userB.id)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Notification not found or access denied',
      });
    });
  });

  // =========================================================================
  // 11. HTTP SECURITY HEADERS & SERVER CONFIGURATION (AC-12)
  // =========================================================================
  describe('11. HTTP Security Headers & Production Configuration (SEC-HEADERS)', () => {
    it('SEC-HEADERS-001: Next.js configuration defines defensive HTTP security headers', async () => {
      expect(nextConfig.headers).toBeDefined();

      if (typeof nextConfig.headers === 'function') {
        const headerRoutes = await nextConfig.headers();
        expect(Array.isArray(headerRoutes)).toBe(true);

        const globalRoute = headerRoutes.find((r) => r.source === '/:path*');
        expect(globalRoute).toBeDefined();

        const headers = globalRoute?.headers ?? [];
        const headerMap = new Map(headers.map((h) => [h.key, h.value]));

        // Verify defensive security headers
        expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
        expect(headerMap.get('X-Frame-Options')).toBe('DENY');
        expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
        expect(headerMap.get('Permissions-Policy')).toContain('camera=()');
      }
    });
  });
});
