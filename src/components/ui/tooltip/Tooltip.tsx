'use client';

import React, { useState, useRef, useId, cloneElement, useCallback } from 'react';
import styles from './Tooltip.module.css';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  readonly content: React.ReactNode;
  readonly children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  readonly position?: TooltipPosition;
  readonly delayMs?: number;
  readonly id?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delayMs = 150,
  id: customId,
}: TooltipProps): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoId = useId();
  const tooltipId = customId ?? `tooltip-${autoId}`;

  const showTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  }, [delayMs]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && isVisible) {
      event.stopPropagation();
      hideTooltip();
    }
    (children.props as React.HTMLAttributes<HTMLElement>).onKeyDown?.(event);
  };

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    showTooltip();
    (children.props as React.HTMLAttributes<HTMLElement>).onMouseEnter?.(event);
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    hideTooltip();
    (children.props as React.HTMLAttributes<HTMLElement>).onMouseLeave?.(event);
  };

  const handleFocus = (event: React.FocusEvent<HTMLElement>) => {
    setIsVisible(true);
    (children.props as React.HTMLAttributes<HTMLElement>).onFocus?.(event);
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    hideTooltip();
    (children.props as React.HTMLAttributes<HTMLElement>).onBlur?.(event);
  };

  const trigger = cloneElement(children, {
    'aria-describedby': isVisible ? tooltipId : children.props['aria-describedby'],
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
  });

  const tooltipClasses = [
    styles.tooltip,
    styles[position],
    isVisible ? styles.visible : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrapper}>
      {trigger}
      <div
        id={tooltipId}
        role="tooltip"
        className={tooltipClasses}
        aria-hidden={!isVisible}
      >
        {content}
      </div>
    </div>
  );
}
