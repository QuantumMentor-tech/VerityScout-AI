import React from 'react';
import styles from './SafeErrorState.module.css';
import { Button } from '../button/Button';

export interface SafeErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly title?: string;
  readonly message: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

export function SafeErrorState({
  title = 'Operation Encountered an Error',
  message,
  onRetry,
  retryLabel = 'Try Again',
  className = '',
  ...rest
}: SafeErrorStateProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className={[styles.container, className].filter(Boolean).join(' ')}
      {...rest}
    >
      <div className={styles.iconWrapper} aria-hidden="true">
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h3 className={styles.title}>{title}</h3>
      <p className={styles.message}>{message}</p>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className={styles.retryButton}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
