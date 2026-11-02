import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { testProviderConnection } from '@/server/providers/connection-tester';
import { isSupportedAiProvider, ConnectionTestResponseDTO } from '@/features/providers/types';
import { logger } from '@/lib/logging/logger';

interface RouteContext {
  params: Promise<{
    providerId: string;
  }>;
}

/**
 * POST /api/settings/providers/[providerId]/test
 * Explicit, user-initiated connection probe to test provider connectivity and API key validity.
 * Strictly non-inference: probes lightweight metadata endpoints without model generation or prompt billing.
 */
export async function POST(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { providerId } = await context.params;

  if (!isSupportedAiProvider(providerId)) {
    return NextResponse.json(
      { error: `Unsupported provider: ${providerId}` },
      { status: 400 }
    );
  }

  try {
    const outcome = await testProviderConnection(userId, providerId);

    const responseBody: ConnectionTestResponseDTO = {
      success: outcome.success,
      code: outcome.code,
      message: outcome.message,
      testedAt: outcome.testedAt,
      durationMs: outcome.durationMs,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDER_TEST_ROUTE_ERROR', 'Unexpected error in provider test handler', {
      callerUserId: userId,
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      {
        success: false,
        code: 'UNKNOWN_ERROR',
        message: 'Internal server error while executing provider connection test.',
        testedAt: new Date().toISOString(),
        durationMs: 0,
      },
      { status: 500 }
    );
  }
}
