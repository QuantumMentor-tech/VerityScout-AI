import React from 'react';
import styles from './FormField.module.css';

export interface FormFieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly error?: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  description,
  error,
  className = '',
  children,
}: FormFieldProps): React.JSX.Element {
  const descriptionId = description ? `${htmlFor}-description` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <div className={styles.labelWrapper}>
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
        {required && (
          <span className={styles.requiredIndicator} aria-hidden="true">
            *
          </span>
        )}
      </div>

      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}

      <div className={styles.controlWrapper}>{children}</div>

      {error && (
        <div id={errorId} className={styles.error} role="alert" aria-live="polite">
          <svg
            className={styles.errorIcon}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
