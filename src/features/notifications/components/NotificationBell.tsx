'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { NotificationCenter } from './NotificationCenter';
import styles from './NotificationBell.module.css';

export interface NotificationBellProps {
  readonly pollIntervalMs?: number | undefined;
}

export function NotificationBell({
  pollIntervalMs = 30000,
}: NotificationBellProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (res.ok) {
        const json = await res.json();
        if (json.success && typeof json.data?.unreadCount === 'number') {
          setUnreadCount(json.data.unreadCount);
        }
      }
    } catch {
      // Non-fatal unread count failure (e.g. offline or unauthenticated)
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();

    if (pollIntervalMs > 0) {
      const intervalId = setInterval(() => {
        void fetchUnreadCount();
      }, pollIntervalMs);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [fetchUnreadCount, pollIntervalMs]);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={`${styles.bellButton} ${isOpen ? styles.bellButtonActive : ''}`}
        onClick={toggleOpen}
        aria-label={`Research Notifications (${unreadCount} unread)`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <svg
          className={styles.bellIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationCenter
        isOpen={isOpen}
        onClose={handleClose}
        onUnreadCountChange={setUnreadCount}
      />
    </div>
  );
}

