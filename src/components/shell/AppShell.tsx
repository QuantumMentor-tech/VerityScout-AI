'use client';

import React, { useState, useRef, useCallback } from 'react';
import styles from './AppShell.module.css';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { MobileNavDrawer } from './MobileNavDrawer';

export interface AppShellProps {
  readonly children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const handleToggleMobileNav = useCallback(() => {
    setIsMobileNavOpen((prev) => !prev);
  }, []);

  const handleCloseMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>

      <AppHeader
        isMobileNavOpen={isMobileNavOpen}
        onToggleMobileNav={handleToggleMobileNav}
        toggleButtonRef={toggleButtonRef}
      />

      <div className={styles.bodyLayout}>
        <AppSidebar />
        <div id="main-content" className={styles.contentArea} tabIndex={-1}>
          {children}
        </div>
      </div>

      <MobileNavDrawer
        isOpen={isMobileNavOpen}
        onClose={handleCloseMobileNav}
        triggerRef={toggleButtonRef}
      />
    </div>
  );
}
