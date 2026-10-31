'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import styles from './MobileNavDrawer.module.css';
import { NavigationLinks } from './NavigationLinks';

export interface MobileNavDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MobileNavDrawer({
  isOpen,
  onClose,
  triggerRef,
}: MobileNavDrawerProps): React.JSX.Element {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const prevIsOpen = useRef(isOpen);

  // Manage keyboard events (Escape key & Focus trap)
  useEffect(() => {
    if (!isOpen) {
      if (prevIsOpen.current && triggerRef?.current) {
        triggerRef.current.focus();
      }
      prevIsOpen.current = isOpen;
      return;
    }

    prevIsOpen.current = isOpen;

    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move initial focus to close button
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      // Focus trap within drawer
      if (event.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusable = Array.from(focusableElements).filter(
          (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
        );

        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <div className={styles.container}>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
        data-testid="mobile-nav-backdrop"
      />

      <div
        ref={drawerRef}
        id="mobile-navigation-drawer"
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation Menu"
        tabIndex={-1}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.brand}>
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              className={styles.brandLogo}
              aria-hidden="true"
            />
            <span className={styles.brandTitle}>
              VerityScout <span className={styles.brandAccent}>AI</span>
            </span>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close navigation drawer"
          >
            <svg
              className={styles.closeIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.navBody}>
          <NavigationLinks onNavigate={onClose} />
        </div>

        <div className={styles.drawerFooter}>
          <span>VerityScout Engine • Phase 3</span>
        </div>
      </div>
    </div>
  );
}
