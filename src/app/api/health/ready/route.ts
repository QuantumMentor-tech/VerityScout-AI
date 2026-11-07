import { NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/config/server-env';
import { query } from '@/server/persistence/database';
import { logger } from '@/lib/logging/logger';

/**
 * Readiness Health Probe (Step 58)
 *
 * Verifies that the application process has validated its environment configuration
 * and can reach the primary PostgreSQL persistence layer.
 * Returns HTTP 200 when ready to serve research requests, or HTTP 503 when degraded.
 * Strictly redacts internal connection strings and infrastructure details.
 */
export async function GET(): Promise<NextResponse> {
  const timestamp = new Date().toISOString();
  let configValid = false;
  let databaseConnected = false;

  try {
    getServerEnv();
    configValid = true;
  } catch (configError) {
    logger.error('HEALTHCHECK_CONFIG_FAILURE', 'Readiness probe detected configuration failure', {
      error: configError instanceof Error ? configError.message : String(configError),
    });
  }

  if (configValid) {
    try {
      await query('SELECT 1 AS readiness_check');
      databaseConnected = true;
    } catch (dbError) {
      logger.error('HEALTHCHECK_DATABASE_FAILURE', 'Readiness probe detected database connection failure', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  const isReady = configValid && databaseConnected;

  const payload = {
    status: isReady ? 'ready' : 'unready',
    timestamp,
    checks: {
      configuration: configValid ? 'valid' : 'invalid',
      database: databaseConnected ? 'connected' : 'unreachable',
    },
    ...(isReady
      ? {}
      : {
          error: 'Service dependencies are unavailable; ingress traffic should not be routed.',
        }),
  };

  return NextResponse.json(payload, {
    status: isReady ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    },
  });
}

