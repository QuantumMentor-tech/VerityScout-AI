import React from 'react';
import styles from './LoadingSpinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly size?: SpinnerSize;
  readonly label?: string;
}

export function LoadingSpinner({
  size = 'md',
  label = 'Loading...',
  className = '',
  ...rest
}: LoadingSpinnerProps): React.JSX.Element {
  return (
    <div
      role="status"
      className={[styles.container, className].filter(Boolean).join(' ')}
      {...rest}
    >
      <svg
        className={`${styles.spinner} ${styles[size]}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          strokeWidth="3"
          strokeDasharray="40 20"
        />
      </svg>
      <span className={styles.visuallyHidden}>{label}</span>
    </div>
  );
}
