import { NextRequest, NextResponse } from 'next/server';
import { AuthService, SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/server/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const authService = new AuthService();
    const result = await authService.signIn({
      email,
      password,
      userAgent,
      ipAddress,
    });

    if (!result.success || !result.user || !result.sessionToken) {
      const status =
        result.errorCode === 'RATE_LIMITED'
          ? 429
          : result.errorCode === 'ACCOUNT_INACTIVE'
          ? 403
          : 401;

      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Authentication failed',
          errorCode: result.errorCode,
          retryAfter: result.retryAfterSeconds,
        },
        { status }
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        user: result.user,
      },
      { status: 200 }
    );

    const cookieOpts = getSessionCookieOptions();
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, cookieOpts);

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request payload or malformed JSON.',
        errorCode: 'INVALID_INPUT',
      },
      { status: 400 }
    );
  }
}
