import { NextRequest, NextResponse } from 'next/server';
import { AuthService, SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/server/auth';

export async function POST(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME);

    if (sessionCookie?.value) {
      const authService = new AuthService();
      await authService.signOut(sessionCookie.value);
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Successfully signed out.',
      },
      { status: 200 }
    );

    // Clear session cookie immediately
    const cookieOpts = getSessionCookieOptions(0);
    response.cookies.set(SESSION_COOKIE_NAME, '', { ...cookieOpts, maxAge: 0 });

    return response;
  } catch {
    const response = NextResponse.json(
      {
        success: true,
        message: 'Signed out.',
      },
      { status: 200 }
    );
    const cookieOpts = getSessionCookieOptions(0);
    response.cookies.set(SESSION_COOKIE_NAME, '', { ...cookieOpts, maxAge: 0 });
    return response;
  }
}
