import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { NotificationService } from '@/server/notifications/notification.service';
import { AppError } from '@/lib/errors/app-error';

const notificationService = new NotificationService();

/**
 * GET /api/notifications
 * Retrieves paginated, sorted in-app notifications for the authenticated user.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10), 1), 100);
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const includeDismissed = searchParams.get('includeDismissed') === 'true';
  const notificationType = searchParams.get('notificationType') ?? undefined;

  try {
    const result = await notificationService.getNotifications(userId, {
      page,
      limit,
      unreadOnly,
      includeDismissed,
      notificationType,
    });

    return NextResponse.json({
      success: true,
      data: result,
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

