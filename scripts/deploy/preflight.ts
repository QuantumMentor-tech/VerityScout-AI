import { validateServerEnv, ConfigValidationError } from '@/lib/config/server-env';
import { closePool, query } from '@/server/persistence/database';
import { getMigrationStatus } from '@/server/persistence/migrations/migrator';

/**
 * VerityScout AI — Deployment Preflight Verification Script
 * Governed by Step 58 (AC-01, AC-02, AC-04, AC-06, AC-08).
 *
 * Verifies:
 * 1. Server environment schema validity and production safety invariants.
 * 2. Database pool reachability via simple heartbeat.
 * 3. Database migration status and absence of schema checksum drift.
 */
export async function runPreflight(): Promise<boolean> {
  console.info('\n======================================================');
  console.info(' VerityScout AI — Deployment Preflight Verification');
  console.info('======================================================\n');

  // Step 1: Validate Server Environment Configuration
  console.info('[1/3] Validating Environment Configuration...');
  let env;
  try {
    env = validateServerEnv(process.env);
    console.info(`  ✓ Environment Tier: ${env.APP_ENV.toUpperCase()} (NODE_ENV: ${env.NODE_ENV})`);
    console.info(`  ✓ Target App URL:   ${env.APP_URL}`);
    console.info(`  ✓ Log Level:        ${env.LOG_LEVEL}`);
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      console.error('  ✗ Environment Validation Failed! Invalid/Missing fields:');
      for (const field of err.invalidFields) {
        console.error(`    - ${field}`);
      }
    } else {
      console.error('  ✗ Unexpected Configuration Error:', err);
    }
    return false;
  }

  // Step 2: Test Database Pool Connectivity
  console.info('\n[2/3] Checking Database Connectivity...');
  try {
    const res = await query<{ current_time: string }>('SELECT NOW() AS current_time');
    const dbTime = res.rows[0]?.current_time;
    console.info(`  ✓ Database Connected Successfully (DB Time: ${dbTime})`);
  } catch (dbErr) {
    console.error('  ✗ Failed to connect to database:');
    console.error(`    ${(dbErr as Error).message}`);
    return false;
  }

  // Step 3: Check Schema Migration Status & Drift
  console.info('\n[3/3] Inspecting Database Migration State...');
  try {
    const status = await getMigrationStatus();
    console.info(`  ✓ Migrations: ${status.appliedCount} applied, ${status.pendingCount} pending, ${status.totalMigrations} total`);

    if (status.hasDrift) {
      console.error('  ✗ CRITICAL ALERT: Database migration drift detected!');
      for (const item of status.items.filter((i) => i.isDrifted)) {
        console.error(`    - ${item.name} checksum mismatch!`);
      }
      return false;
    }

    if (status.pendingCount > 0) {
      console.warn(`  ! WARNING: ${status.pendingCount} pending migration(s) must be applied before serving traffic:`);
      for (const item of status.items.filter((i) => !i.isApplied)) {
        console.warn(`    + ${item.name}`);
      }
      // Return false if in production and pending migrations exist
      if (env.APP_ENV === 'production') {
        console.error('  ✗ In production tier, all migrations must be applied before deployment completes.');
        return false;
      }
    } else {
      console.info('  ✓ All database migrations are up to date and verified.');
    }
  } catch (migErr) {
    console.error('  ✗ Failed to inspect migrations:', (migErr as Error).message);
    return false;
  }

  console.info('\n======================================================');
  console.info(' ✓ Deployment Preflight Checks Passed.');
  console.info('======================================================\n');
  return true;
}

if (require.main === module || process.argv[1]?.endsWith('preflight.ts')) {
  runPreflight()
    .then((success) => {
      closePool()
        .catch(() => {})
        .finally(() => {
          process.exit(success ? 0 : 1);
        });
    })
    .catch((err) => {
      console.error('Fatal preflight error:', err);
      process.exit(1);
    });
}
