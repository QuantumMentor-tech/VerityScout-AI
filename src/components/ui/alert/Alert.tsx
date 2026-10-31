import React from 'react';
import styles from './Alert.module.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly variant?: AlertVariant;
  readonly title?: string;
  readonly onDismiss?: () => void;
}

function AlertIcon({ variant }: { variant: AlertVariant }): React.JSX.Element {
  switch (variant) {
    case 'success':
      return (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      );
    case 'warning':
      return (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'danger':
      return (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
}

export function Alert({
  variant = 'info',
  title,
  onDismiss,
  className = '',
  children,
  role,
  ...rest
}: AlertProps): React.JSX.Element {
  const defaultRole = variant === 'danger' || variant === 'warning' ? 'alert' : 'status';
  const alertRole = role ?? defaultRole;

  const alertClasses = [
    styles.alert,
    styles[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={alertClasses} role={alertRole} {...rest}>
      <span className={styles.iconWrapper} aria-hidden="true">
        <AlertIcon variant={variant} />
      </span>

      <div className={styles.body}>
        {title && <h4 className={styles.title}>{title}</h4>}
        <div>{children}</div>
      </div>

      {onDismiss && (
        <button
          type="button"
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss alert"
        >
          <svg
            className={styles.dismissIcon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
