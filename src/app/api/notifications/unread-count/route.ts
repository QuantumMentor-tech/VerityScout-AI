import { NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { NotificationService } from '@/server/notifications/notification.service';
import { AppError } from '@/lib/errors/app-error';

const notificationService = new NotificationService();

/**
 * GET /api/notifications/unread-count
 * Returns the unread, non-dismissed notification count for the authenticated user.
 */
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const count = await notificationService.getUnreadCount(userId);
    return NextResponse.json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
