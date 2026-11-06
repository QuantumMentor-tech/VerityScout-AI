'use client';

import React from 'react';
import Link from 'next/link';
import { InAppNotificationDto } from '../types';
import styles from './NotificationItem.module.css';

export interface NotificationItemProps {
  readonly notification: InAppNotificationDto;
  readonly onMarkAsRead: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDismiss,
}: NotificationItemProps): React.JSX.Element {
  const isUnread = !notification.read_at;

  const getBadgeClass = (type: string): string => {
    switch (type) {
      case 'PRICE_DROP':
        return styles.badgePriceDrop ?? '';
      case 'PRICE_INCREASE':
        return styles.badgePriceIncrease ?? '';
      case 'STOCK_STATUS_CHANGED':
        return styles.badgeStock ?? '';
      case 'SPECIFICATION_UPDATED':
        return styles.badgeSpec ?? '';
      case 'NEW_CANDIDATE_OBSERVED':
      case 'NEW_OFFER_DISCOVERED':
        return styles.badgeObservation ?? '';
      case 'CONFLICTING_EVIDENCE_OBSERVED':
        return styles.badgeConflict ?? '';
      case 'ATTRIBUTE_NO_LONGER_OBSERVED':
        return styles.badgeConflict ?? '';
      default:
        return styles.badgeGeneral ?? '';
    }
  };

  const getBadgeLabel = (type: string): string => {
    switch (type) {
      case 'PRICE_DROP':
        return 'Price Drop';
      case 'PRICE_INCREASE':
        return 'Price Increase';
      case 'STOCK_STATUS_CHANGED':
        return 'Stock Change';
      case 'SPECIFICATION_UPDATED':
        return 'Spec Update';
      case 'NEW_OFFER_DISCOVERED':
        return 'New Offer';
      case 'NEW_CANDIDATE_OBSERVED':
        return 'Observation';
      case 'ATTRIBUTE_NO_LONGER_OBSERVED':
        return 'Not Observed';
      case 'CONFLICTING_EVIDENCE_OBSERVED':
        return 'Conflict';
      default:
        return 'Change';
    }
  };

  const formattedTime = new Date(notification.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`${styles.card} ${isUnread ? styles.cardUnread : ''}`}
      role="article"
      aria-label={`${notification.title} - ${isUnread ? 'Unread' : 'Read'}`}
    >
      <div className={styles.header}>
        <div className={styles.titleArea}>
          {isUnread && <span className={styles.unreadDot} aria-hidden="true" />}
          <span className={`${styles.badge} ${getBadgeClass(notification.notification_type)}`}>
            {getBadgeLabel(notification.notification_type)}
          </span>
          <h4 className={styles.title}>{notification.title}</h4>
        </div>
      </div>

      <p className={styles.summary}>{notification.summary}</p>

      <div className={styles.footer}>
        <time className={styles.time} dateTime={notification.created_at}>
          {formattedTime}
        </time>

        <div className={styles.actions}>
          <Link
            href={`/research/runs/${notification.research_run_id}`}
            className={styles.linkBtn}
            onClick={() => {
              if (isUnread) onMarkAsRead(notification.id);
            }}
          >
            View Run →
          </Link>

          {isUnread && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => onMarkAsRead(notification.id)}
              aria-label={`Mark "${notification.title}" as read`}
            >
              Mark Read
            </button>
          )}

          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => onDismiss(notification.id)}
            aria-label={`Dismiss notification "${notification.title}"`}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
