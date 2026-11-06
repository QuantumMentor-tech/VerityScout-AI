import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getNotifications } from '@/app/api/notifications/route';
import { GET as getUnreadCount } from '@/app/api/notifications/unread-count/route';
import { PATCH as markAsRead } from '@/app/api/notifications/[id]/read/route';
import { POST as markAllAsRead } from '@/app/api/notifications/read-all/route';
import { PATCH as dismissNotification } from '@/app/api/notifications/[id]/dismiss/route';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { NotificationService } from '@/server/notifications/notification.service';
import { NotificationType, InAppNotificationRow } from '@/server/persistence/types';
import { AppError } from '@/lib/errors/app-error';

vi.mock('@/server/auth/authorization', () => ({
  requireAuthenticatedCaller: vi.fn(),
}));

vi.mock('@/server/notifications/notification.service');

describe('Notification REST APIs (Step 50)', () => {
  const mockNotification: InAppNotificationRow = {
    id: '11111111-2222-3333-4444-555555555555',
    user_id: 'user-1',
    notification_type: NotificationType.PRICE_DROP,
    source_event_type: 'CHANGE_EVENT',
    source_event_id: 'ch-1',
    task_id: 'task-1',
    research_run_id: 'run-1',
    schedule_id: null,
    comparison_id: 'comp-1',
    title: 'Price Drop: RTX 4080 Super',
    summary: 'Observed price dropped to 969.99 USD.',
    metadata: {},
    idempotency_key: 'idem-1',
    read_at: null,
    dismissed_at: null,
    created_at: '2026-11-06T10:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuthenticatedCaller).mockResolvedValue({
      user: { id: 'user-1', email: 'test@verityscout.local', displayName: 'Test User', createdAt: '2026-11-01T00:00:00.000Z' },
      userId: 'user-1',
    });
  });

  describe('GET /api/notifications', () => {
    it('returns 401 when caller is unauthenticated', async () => {
      vi.mocked(requireAuthenticatedCaller).mockRejectedValueOnce(new Error('Unauthenticated'));

      const req = new NextRequest('http://localhost:3000/api/notifications');
      const res = await getNotifications(req);
      expect(res.status).toBe(401);
    });

    it('returns paginated notifications for authenticated user', async () => {
      vi.mocked(NotificationService.prototype.getNotifications).mockResolvedValueOnce({
        data: [mockNotification],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const req = new NextRequest('http://localhost:3000/api/notifications?page=1&limit=20&unreadOnly=true');
      const res = await getNotifications(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.data).toHaveLength(1);
      expect(json.data.data[0].title).toBe('Price Drop: RTX 4080 Super');
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('returns unread notification count', async () => {
      vi.mocked(NotificationService.prototype.getUnreadCount).mockResolvedValueOnce(3);

      const res = await getUnreadCount();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.unreadCount).toBe(3);
    });
  });

  describe('PATCH /api/notifications/[id]/read', () => {
    it('marks a notification as read', async () => {
      vi.mocked(NotificationService.prototype.markAsRead).mockResolvedValueOnce({
        ...mockNotification,
        read_at: '2026-11-06T10:05:00.000Z',
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/11111111-2222-3333-4444-555555555555/read', {
        method: 'PATCH',
      });
      const res = await markAsRead(req, {
        params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.read_at).toBeTruthy();
    });

    it('returns 404 when notification does not exist or belongs to another user', async () => {
      vi.mocked(NotificationService.prototype.markAsRead).mockRejectedValueOnce(
        new AppError({ code: 'NOT_FOUND', message: 'Notification not found or access denied', statusCode: 404 })
      );

      const req = new NextRequest('http://localhost:3000/api/notifications/unknown-id/read', {
        method: 'PATCH',
      });
      const res = await markAsRead(req, {
        params: Promise.resolve({ id: 'unknown-id' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/notifications/read-all', () => {
    it('marks all notifications as read', async () => {
      vi.mocked(NotificationService.prototype.markAllAsRead).mockResolvedValueOnce(5);

      const res = await markAllAsRead();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.updatedCount).toBe(5);
    });
  });

  describe('PATCH /api/notifications/[id]/dismiss', () => {
    it('dismisses a notification', async () => {
      vi.mocked(NotificationService.prototype.dismissNotification).mockResolvedValueOnce({
        ...mockNotification,
        dismissed_at: '2026-11-06T10:06:00.000Z',
      });

      const req = new NextRequest('http://localhost:3000/api/notifications/11111111-2222-3333-4444-555555555555/dismiss', {
        method: 'PATCH',
      });
      const res = await dismissNotification(req, {
        params: Promise.resolve({ id: '11111111-2222-3333-4444-555555555555' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.dismissed_at).toBeTruthy();
    });
  });
});
