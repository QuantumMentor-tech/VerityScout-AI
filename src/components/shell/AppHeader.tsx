'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './AppHeader.module.css';
import { AuthStatusIndicator } from '../auth/AuthStatusIndicator';
import { NotificationBell } from '@/features/notifications';

export interface AppHeaderProps {
  readonly isMobileNavOpen: boolean;
  readonly onToggleMobileNav: () => void;
  readonly toggleButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function AppHeader({
  isMobileNavOpen,
  onToggleMobileNav,
  toggleButtonRef,
}: AppHeaderProps): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <button
          ref={toggleButtonRef}
          type="button"
          className={styles.mobileToggle}
          onClick={onToggleMobileNav}
          aria-expanded={isMobileNavOpen}
          aria-controls="mobile-navigation-drawer"
          aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {isMobileNavOpen ? (
            <svg
              className={styles.toggleIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg
              className={styles.toggleIcon}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        <Link href="/" className={styles.brandLink} aria-label="VerityScout AI Home">
          <Image
            src="/logo.png"
            alt=""
            width={28}
            height={28}
            className={styles.brandLogo}
            priority
            aria-hidden="true"
          />
          <span className={styles.brandName}>
            VerityScout <span className={styles.brandAccent}>AI</span>
          </span>
        </Link>
      </div>

      <div className={styles.rightSection}>
        <div className={styles.statusPill}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span>v0.1.0 • Engine Active</span>
        </div>
        <NotificationBell />
        <AuthStatusIndicator />
      </div>
    </header>
  );
}

