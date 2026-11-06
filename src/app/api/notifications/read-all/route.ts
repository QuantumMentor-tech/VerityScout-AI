import { NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { NotificationService } from '@/server/notifications/notification.service';
import { AppError } from '@/lib/errors/app-error';

const notificationService = new NotificationService();

/**
 * POST /api/notifications/read-all
 * Marks all unread, non-dismissed notifications as read for the authenticated caller.
 */
export async function POST(): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const updatedCount = await notificationService.markAllAsRead(userId);
    return NextResponse.json({
      success: true,
      data: {
        updatedCount,
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
