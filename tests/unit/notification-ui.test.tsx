import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { NotificationBell, NotificationCenter } from '@/features/notifications';
import { InAppNotificationDto } from '@/features/notifications/types';

describe('Notification UI Components (Step 50)', () => {
  const sampleNotification: InAppNotificationDto = {
    id: 'notif-1',
    notification_type: 'PRICE_DROP',
    source_event_type: 'CHANGE_EVENT',
    source_event_id: 'ch-1',
    task_id: 'task-1',
    research_run_id: 'run-1',
    schedule_id: null,
    comparison_id: 'comp-1',
    title: 'Price Drop: RTX 4070 Super',
    summary: 'Observed price dropped from 599.99 USD to 549.99 USD.',
    metadata: {},
    read_at: null,
    dismissed_at: null,
    created_at: '2026-11-06T10:00:00.000Z',
    updated_at: '2026-11-06T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NotificationBell', () => {
    it('fetches unread count and renders badge when count > 0', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { unreadCount: 3 } }),
      });

      render(<NotificationBell pollIntervalMs={0} />);

      await waitFor(() => {
        expect(screen.getByText('3')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /Research Notifications \(3 unread\)/i })).toBeInTheDocument();
    });

    it('toggles NotificationCenter dialog on click', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/notifications/unread-count')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: { unreadCount: 1 } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              data: [sampleNotification],
              pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            },
          }),
        });
      });

      render(<NotificationBell pollIntervalMs={0} />);

      const button = screen.getByRole('button', { name: /Research Notifications/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /In-App Notifications/i })).toBeInTheDocument();
        expect(screen.getByText('Price Drop: RTX 4070 Super')).toBeInTheDocument();
      });
    });
  });

  describe('NotificationCenter', () => {
    it('renders empty state when no notifications exist', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/notifications/unread-count')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: { unreadCount: 0 } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              data: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
            },
          }),
        });
      });

      render(<NotificationCenter isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();
      });
    });

    it('marks notification as read and triggers count update', async () => {
      const onUnreadCountChange = vi.fn();

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/notifications/unread-count')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: { unreadCount: 1 } }),
          });
        }
        if (url.includes('/read')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true, data: { ...sampleNotification, read_at: '2026-11-06T10:05:00.000Z' } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              data: [sampleNotification],
              pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
            },
          }),
        });
      });

      render(
        <NotificationCenter
          isOpen={true}
          onClose={vi.fn()}
          onUnreadCountChange={onUnreadCountChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Price Drop: RTX 4070 Super')).toBeInTheDocument();
      });

      const markReadBtn = screen.getByRole('button', { name: /Mark "Price Drop: RTX 4070 Super" as read/i });
      fireEvent.click(markReadBtn);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/notifications/notif-1/read',
          expect.objectContaining({ method: 'PATCH' })
        );
      });
    });
  });
});

