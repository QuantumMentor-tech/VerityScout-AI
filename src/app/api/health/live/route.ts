import { NextResponse } from 'next/server';

/**
 * Liveness Health Probe (Step 58)
 *
 * Verifies that the Node.js/Next.js HTTP server process is running and accepting sockets.
 * Does NOT execute downstream database or provider calls to prevent false-positive restart loops.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}

