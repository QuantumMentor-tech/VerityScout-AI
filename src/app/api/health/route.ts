import { NextResponse } from 'next/server';

/**
 * Top-Level Application Health Probe (Step 58)
 *
 * Lightweight health endpoint for reverse proxies, container engines, and edge routing.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'healthy',
      service: 'verityscout-ai',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}

