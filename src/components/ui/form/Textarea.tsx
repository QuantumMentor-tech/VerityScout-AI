import React, { forwardRef } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly isInvalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    isInvalid = false,
    className = '',
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref
): React.JSX.Element {
  const textareaClasses = [
    styles.textarea,
    isInvalid ? styles.invalid : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <textarea
      ref={ref}
      className={textareaClasses}
      aria-invalid={ariaInvalid ?? (isInvalid ? 'true' : undefined)}
      {...rest}
    />
  );
});
