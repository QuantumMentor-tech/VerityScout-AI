import React, { forwardRef } from 'react';
import styles from './Input.module.css';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly isInvalid?: boolean;
  readonly sizeVariant?: InputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    isInvalid = false,
    sizeVariant = 'md',
    type = 'text',
    className = '',
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref
): React.JSX.Element {
  const inputClasses = [
    styles.input,
    styles[sizeVariant],
    isInvalid ? styles.invalid : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      ref={ref}
      type={type}
      className={inputClasses}
      aria-invalid={ariaInvalid ?? (isInvalid ? 'true' : undefined)}
      {...rest}
    />
  );
});
