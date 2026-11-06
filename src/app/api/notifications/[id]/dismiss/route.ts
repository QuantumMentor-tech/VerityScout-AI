import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { NotificationService } from '@/server/notifications/notification.service';
import { AppError } from '@/lib/errors/app-error';

const notificationService = new NotificationService();

/**
 * PATCH /api/notifications/[id]/dismiss
 * Dismisses a specific notification, scoped to the authenticated caller.
 */
export async function PATCH(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
  }

  try {
    const updated = await notificationService.dismissNotification(id, userId);
    return NextResponse.json({
      success: true,
      data: updated,
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

