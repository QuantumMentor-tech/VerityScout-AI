import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, validateSessionToken, toSafeUser } from '@/server/auth';

export async function GET(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
      },
      { status: 200 }
    );
  }

  const result = await validateSessionToken(sessionCookie.value);
  if (!result) {
    return NextResponse.json(
      {
        authenticated: false,
        user: null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: toSafeUser(result.user),
    },
    { status: 200 }
  );
}
