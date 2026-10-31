import React, { forwardRef } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  readonly label?: React.ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    disabled = false,
    className = '',
    id,
    ...rest
  },
  ref
): React.JSX.Element {
  const containerClasses = [
    styles.container,
    disabled ? styles.containerDisabled : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={containerClasses} htmlFor={id}>
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className={styles.input}
        disabled={disabled}
        {...rest}
      />
      <span className={styles.box} aria-hidden="true">
        <svg
          className={styles.checkIcon}
          viewBox="0 0 24 24"
          focusable="false"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
});
