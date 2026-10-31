import React from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly title: string;
  readonly description: string;
  readonly icon?: React.ReactNode;
  readonly action?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
  ...rest
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className={[styles.container, className].filter(Boolean).join(' ')} {...rest}>
      {icon && (
        <div className={styles.iconWrapper} aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.actionWrapper}>{action}</div>}
    </div>
  );
}
