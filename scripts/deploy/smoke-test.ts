/**
 * VerityScout AI — Post-Deployment Smoke Test Suite
 * Governed by Step 58 (AC-08, AC-09, AC-10, AC-14).
 *
 * Verifies live endpoint behavior, health status, unauthenticated boundary enforcement,
 * and security header enforcement without triggering paid model calls or destructive mutations.
 */

export interface SmokeTestResult {
  readonly checkName: string;
  readonly passed: boolean;
  readonly details: string;
}

export async function runDeploymentSmokeTest(baseUrl: string): Promise<SmokeTestResult[]> {
  const results: SmokeTestResult[] = [];
  const normalizedBase = baseUrl.replace(/\/+$/, '');

  console.info(`\n[Smoke Test] Target: ${normalizedBase}\n`);

  async function executeCheck(
    name: string,
    checkFn: () => Promise<{ ok: boolean; message: string }>
  ) {
    try {
      const res = await checkFn();
      results.push({ checkName: name, passed: res.ok, details: res.message });
      console.info(`  ${res.ok ? '✓' : '✗'} ${name}: ${res.message}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ checkName: name, passed: false, details: `Exception: ${message}` });
      console.error(`  ✗ ${name}: Exception - ${message}`);
    }
  }

  // 1. Liveness Health Probe
  await executeCheck('Liveness Probe (/api/health/live)', async () => {
    const res = await fetch(`${normalizedBase}/api/health/live`);
    if (res.status !== 200) return { ok: false, message: `Expected HTTP 200, got ${res.status}` };
    const data = (await res.json()) as { status?: string };
    if (data.status !== 'alive') return { ok: false, message: `Expected status "alive", got "${data.status}"` };
    return { ok: true, message: 'Process is alive and accepting traffic' };
  });

  // 2. Readiness Health Probe
  await executeCheck('Readiness Probe (/api/health/ready)', async () => {
    const res = await fetch(`${normalizedBase}/api/health/ready`);
    if (res.status !== 200) return { ok: false, message: `Expected HTTP 200, got ${res.status}` };
    const data = (await res.json()) as { status?: string; checks?: { database?: string } };
    if (data.status !== 'ready') return { ok: false, message: `Expected status "ready", got "${data.status}"` };
    if (data.checks?.database !== 'connected') return { ok: false, message: `Database check: "${data.checks?.database}"` };
    return { ok: true, message: 'Database connected and environment valid' };
  });

  // 3. General Health Probe
  await executeCheck('General Health (/api/health)', async () => {
    const res = await fetch(`${normalizedBase}/api/health`);
    if (res.status !== 200) return { ok: false, message: `Expected HTTP 200, got ${res.status}` };
    const data = (await res.json()) as { status?: string; service?: string };
    if (data.status !== 'healthy' || data.service !== 'verityscout-ai') {
      return { ok: false, message: `Unexpected response payload: ${JSON.stringify(data)}` };
    }
    return { ok: true, message: 'Service metadata confirmed' };
  });

  // 4. Public Web Page & Security Headers
  await executeCheck('Public Web Surface (/)', async () => {
    const res = await fetch(`${normalizedBase}/`);
    if (res.status !== 200) return { ok: false, message: `Expected HTTP 200, got ${res.status}` };
    const nosniff = res.headers.get('x-content-type-options');
    const xframe = res.headers.get('x-frame-options');
    if (nosniff !== 'nosniff') return { ok: false, message: `Missing X-Content-Type-Options: nosniff (got "${nosniff}")` };
    if (xframe !== 'DENY') return { ok: false, message: `Missing X-Frame-Options: DENY (got "${xframe}")` };
    return { ok: true, message: 'Landing page rendered with hardened security headers' };
  });

  // 5. Authentication Ingress Routes
  await executeCheck('Auth Sign-In Page (/auth/signin)', async () => {
    const res = await fetch(`${normalizedBase}/auth/signin`);
    if (res.status !== 200) return { ok: false, message: `Expected HTTP 200, got ${res.status}` };
    return { ok: true, message: 'Sign-in page route reachable' };
  });

  // 6. Protected API Route Authorization Enforcement
  await executeCheck('Protected Research API Guard (/api/research)', async () => {
    const res = await fetch(`${normalizedBase}/api/research`);
    if (res.status !== 401) {
      return { ok: false, message: `Expected HTTP 401 Unauthorized, got ${res.status}` };
    }
    return { ok: true, message: 'Protected endpoint safely rejects unauthenticated access' };
  });

  // 7. Protected Provider Settings Route Authorization Enforcement
  await executeCheck('Protected Settings API Guard (/api/settings/providers)', async () => {
    const res = await fetch(`${normalizedBase}/api/settings/providers`);
    if (res.status !== 401) {
      return { ok: false, message: `Expected HTTP 401 Unauthorized, got ${res.status}` };
    }
    return { ok: true, message: 'Vault credentials safely protected from unauthorized access' };
  });

  // 8. 404 Error Surface (No Information Disclosure)
  await executeCheck('Information Disclosure Guard (404 Page)', async () => {
    const res = await fetch(`${normalizedBase}/api/__smoke_test_nonexistent_route__`);
    if (res.status !== 404) return { ok: false, message: `Expected HTTP 404, got ${res.status}` };
    const body = await res.text();
    if (body.includes('node_modules') || body.includes('stack') || body.includes('POSTGRES_PASSWORD')) {
      return { ok: false, message: 'Sensitive diagnostic information exposed in error output' };
    }
    return { ok: true, message: 'Error responses properly sanitized' };
  });

  return results;
}

if (require.main === module || process.argv[1]?.endsWith('smoke-test.ts')) {
  const target = process.argv[2] ?? process.env.TARGET_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  runDeploymentSmokeTest(target)
    .then((results) => {
      const allPassed = results.every((r) => r.passed);
      console.info(`\nDeployment Smoke Tests: ${results.filter((r) => r.passed).length}/${results.length} passed.`);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal smoke test error:', err);
      process.exit(1);
    });
}

