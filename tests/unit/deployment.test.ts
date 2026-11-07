import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateServerEnv, ConfigValidationError } from '@/lib/config/server-env';
import { GET as getLiveHealth } from '@/app/api/health/live/route';
import { GET as getReadyHealth } from '@/app/api/health/ready/route';
import { GET as getGeneralHealth } from '@/app/api/health/route';
import * as databaseModule from '@/server/persistence/database';
import { runDeploymentSmokeTest } from '../../scripts/deploy/smoke-test';

describe('Deployment & Operational Readiness (Step 58)', () => {
  describe('Environment Isolation & Production Safety (AC-02, AC-04)', () => {
    it('accepts valid production environment configuration with secure secrets', () => {
      const config = validateServerEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        APP_URL: 'https://verityscout.example.com',
        VAULT_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-db.internal:5432/verityscout_prod',
      });

      expect(config.APP_ENV).toBe('production');
      expect(config.NODE_ENV).toBe('production');
      expect(config.APP_URL).toBe('https://verityscout.example.com');
    });

    it('rejects default development vault key when APP_ENV is production', () => {
      expect(() => {
        validateServerEnv({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          APP_URL: 'https://verityscout.example.com',
          DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-db.internal:5432/verityscout_prod',
          // Omitting VAULT_MASTER_KEY falls back to the insecure dev key
        });
      }).toThrow(ConfigValidationError);
    });

    it('rejects default dev database password when APP_ENV is production', () => {
      expect(() => {
        validateServerEnv({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          APP_URL: 'https://verityscout.example.com',
          VAULT_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          // Omitting DATABASE_URL and leaving default POSTGRES_PASSWORD
        });
      }).toThrow(ConfigValidationError);
    });

    it('rejects localhost or loopback APP_URL in production', () => {
      expect(() => {
        validateServerEnv({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          APP_URL: 'http://localhost:3000',
          VAULT_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-db.internal:5432/verityscout_prod',
        });
      }).toThrow(ConfigValidationError);
    });

    it('rejects non-HTTPS APP_URL in production unless explicitly allowed', () => {
      expect(() => {
        validateServerEnv({
          NODE_ENV: 'production',
          APP_ENV: 'production',
          APP_URL: 'http://verityscout.example.com',
          VAULT_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-db.internal:5432/verityscout_prod',
        });
      }).toThrow(ConfigValidationError);

      // Allowed when internal VPC override is provided
      const overrideConfig = validateServerEnv({
        NODE_ENV: 'production',
        APP_ENV: 'production',
        APP_URL: 'http://verityscout.internal.vpc',
        VAULT_MASTER_KEY: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        DATABASE_URL: 'postgresql://prod_user:strong_pass@prod-db.internal:5432/verityscout_prod',
        ALLOW_INSECURE_HTTP_IN_PRODUCTION: 'true',
      });
      expect(overrideConfig.ALLOW_INSECURE_HTTP_IN_PRODUCTION).toBe(true);
    });

    it('rejects localhost APP_URL in staging environment', () => {
      expect(() => {
        validateServerEnv({
          NODE_ENV: 'production',
          APP_ENV: 'staging',
          APP_URL: 'http://localhost:3000',
        });
      }).toThrow(ConfigValidationError);
    });

    it('accepts valid staging configuration with staging domain', () => {
      const config = validateServerEnv({
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        APP_URL: 'https://staging.verityscout.example.com',
      });
      expect(config.APP_ENV).toBe('staging');
      expect(config.APP_URL).toBe('https://staging.verityscout.example.com');
    });

    it('rejects unsupported APP_ENV values', () => {
      expect(() => {
        validateServerEnv({
          APP_ENV: 'sandbox' as unknown as string,
        });
      }).toThrow(ConfigValidationError);
    });
  });

  describe('Health Probes & Operational Monitoring (AC-08, AC-11)', () => {
    it('Liveness probe (/api/health/live) returns 200 alive without database dependencies', async () => {
      const response = await getLiveHealth();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('alive');
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.uptimeSeconds).toBe('number');
      expect(body.version).toBeDefined();
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    });

    it('General health probe (/api/health) returns 200 healthy', async () => {
      const response = await getGeneralHealth();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('verityscout-ai');
      expect(body.timestamp).toBeDefined();
    });

    it('Readiness probe (/api/health/ready) returns 200 ready when database query succeeds', async () => {
      const querySpy = vi.spyOn(databaseModule, 'query').mockResolvedValueOnce({
        rows: [{ readiness_check: 1 }],
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const response = await getReadyHealth();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('ready');
      expect(body.checks.configuration).toBe('valid');
      expect(body.checks.database).toBe('connected');

      querySpy.mockRestore();
    });

    it('Readiness probe returns 503 unready when database query fails without leaking secrets', async () => {
      const querySpy = vi
        .spyOn(databaseModule, 'query')
        .mockRejectedValueOnce(new Error('Connection lost to host 10.0.0.45:5432'));

      const response = await getReadyHealth();
      expect(response.status).toBe(503);

      const body = await response.json();
      expect(body.status).toBe('unready');
      expect(body.checks.database).toBe('unreachable');
      expect(body.error).toBeDefined();
      // Ensure no raw host IP or credentials leaked in public response
      expect(JSON.stringify(body)).not.toContain('10.0.0.45');
      expect(JSON.stringify(body)).not.toContain('5432');

      querySpy.mockRestore();
    });
  });

  describe('Post-Deployment Smoke Test Suite (AC-09, AC-14)', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('exercises the comprehensive smoke suite against mock target and reports results', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        const u = new URL(url);

        if (u.pathname === '/api/health/live') {
          return Promise.resolve(
            new Response(JSON.stringify({ status: 'alive' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }

        if (u.pathname === '/api/health/ready') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ status: 'ready', checks: { database: 'connected' } }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          );
        }

        if (u.pathname === '/api/health') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ status: 'healthy', service: 'verityscout-ai' }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          );
        }

        if (u.pathname === '/' || u.pathname === '/auth/signin') {
          return Promise.resolve(
            new Response('<!DOCTYPE html><html><body>VerityScout</body></html>', {
              status: 200,
              headers: {
                'Content-Type': 'text/html',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
              },
            })
          );
        }

        if (u.pathname.startsWith('/api/research') || u.pathname.startsWith('/api/settings/providers')) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }

        if (u.pathname.includes('__smoke_test_nonexistent_route__')) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'Not Found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }

        return Promise.resolve(new Response('Not Found', { status: 404 }));
      });

      const results = await runDeploymentSmokeTest('https://mock-staging.example.com');
      expect(results.length).toBe(8);
      const allPassed = results.every((r) => r.passed);
      expect(allPassed).toBe(true);
    });

    it('catches and reports degraded readiness during smoke test', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/health/ready')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ status: 'unready', checks: { database: 'unreachable' } }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              }
            )
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ status: 'alive' }), { status: 200 }));
      });

      const results = await runDeploymentSmokeTest('https://mock-degraded.example.com');
      const readyCheck = results.find((r) => r.checkName.includes('Readiness'));
      expect(readyCheck?.passed).toBe(false);
      expect(readyCheck?.details).toContain('503');
    });
  });
});

