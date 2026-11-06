'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { InAppNotificationDto, NotificationPaginationDto } from '../types';
import { NotificationItem } from './NotificationItem';
import styles from './NotificationCenter.module.css';

export interface NotificationCenterProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onUnreadCountChange?: ((count: number) => void) | undefined;
}

export function NotificationCenter({
  isOpen,
  onClose,
  onUnreadCountChange,
}: NotificationCenterProps): React.JSX.Element | null {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<InAppNotificationDto[]>([]);
  const [pagination, setPagination] = useState<NotificationPaginationDto>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(
    async (currentPage: number = 1, currentTab: 'all' | 'unread' = tab, append: boolean = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          page: String(currentPage),
          limit: '20',
          unreadOnly: currentTab === 'unread' ? 'true' : 'false',
        });

        const res = await fetch(`/api/notifications?${queryParams.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load notifications (HTTP ${res.status})`);
        }

        const json = await res.json();
        if (json.success && json.data) {
          const fetchedItems: InAppNotificationDto[] = json.data.data ?? [];
          const fetchedPagination: NotificationPaginationDto = json.data.pagination ?? {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 1,
          };

          setNotifications((prev) => (append ? [...prev, ...fetchedItems] : fetchedItems));
          setPagination(fetchedPagination);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading notifications');
      } finally {
        setIsLoading(false);
      }
    },
    [tab]
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (res.ok) {
        const json = await res.json();
        if (json.success && typeof json.data?.unreadCount === 'number') {
          onUnreadCountChange?.(json.data.unreadCount);
        }
      }
    } catch {
      // Non-fatal
    }
  }, [onUnreadCountChange]);

  // Load notifications whenever panel opens or tab changes
  useEffect(() => {
    if (isOpen) {
      void fetchNotifications(1, tab, false);
      void fetchUnreadCount();
    }
  }, [isOpen, tab, fetchNotifications, fetchUnreadCount]);

  // Click outside and ESC key dismiss handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleMarkAsRead = async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, read_at: new Date().toISOString() } : item
      )
    );

    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        void fetchUnreadCount();
      }
    } catch {
      // Revert if needed, but safe
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic update
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => ({ ...item, read_at: item.read_at ?? now })));

    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        onUnreadCountChange?.(0);
      }
    } catch {
      void fetchNotifications(1, tab, false);
      void fetchUnreadCount();
    }
  };

  const handleDismiss = async (id: string) => {
    // Optimistic removal
    setNotifications((prev) => prev.filter((item) => item.id !== id));

    try {
      await fetch(`/api/notifications/${id}/dismiss`, { method: 'PATCH' });
      void fetchUnreadCount();
    } catch {
      // Non-fatal
    }
  };

  const handleLoadMore = () => {
    if (pagination.page < pagination.totalPages) {
      void fetchNotifications(pagination.page + 1, tab, true);
    }
  };

  if (!isOpen) return null;

  const unreadItemsCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-label="In-App Notifications"
      aria-modal="true"
    >
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <h3 className={styles.title}>Notifications</h3>
          {unreadItemsCount > 0 && (
            <span className={styles.unreadCountBadge}>
              {unreadItemsCount}
            </span>
          )}
        </div>

        <button
          type="button"
          className={styles.markAllBtn}
          onClick={handleMarkAllAsRead}
          disabled={unreadItemsCount === 0}
          aria-label="Mark all notifications as read"
        >
          Mark all as read
        </button>
      </div>

      <div className={styles.tabBar} role="tablist" aria-label="Notification Filters">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'all'}
          className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
          onClick={() => setTab('all')}
        >
          All
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'unread'}
          className={`${styles.tab} ${tab === 'unread' ? styles.tabActive : ''}`}
          onClick={() => setTab('unread')}
        >
          Unread
        </button>
      </div>

      <div className={styles.listContainer}>
        {isLoading && notifications.length === 0 && (
          <div className={styles.loadingState}>Loading notifications...</div>
        )}

        {error && (
          <div className={styles.errorState}>
            <span>{error}</span>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => void fetchNotifications(1, tab, false)}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && notifications.length === 0 && (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p className={styles.emptyText}>
              {tab === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </p>
            <p className={styles.emptySubtext}>
              {tab === 'unread'
                ? 'You have reviewed all your research change alerts.'
                : 'Eligible research monitoring changes will appear here.'}
            </p>
          </div>
        )}

        {notifications.map((notif) => (
          <NotificationItem
            key={notif.id}
            notification={notif}
            onMarkAsRead={handleMarkAsRead}
            onDismiss={handleDismiss}
          />
        ))}

        {pagination.page < pagination.totalPages && (
          <button
            type="button"
            className={styles.loadMoreBtn}
            onClick={handleLoadMore}
            disabled={isLoading}
          >
            {isLoading ? 'Loading more...' : 'Load more notifications'}
          </button>
        )}
      </div>

      <div className={styles.footer}>
        <Link href="/history" className={styles.footerLink} onClick={onClose}>
          Browse Full Run History →
        </Link>
      </div>
    </div>
  );
}

