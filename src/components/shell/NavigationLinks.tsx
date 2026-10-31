'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './NavigationLinks.module.css';
import {
  NAVIGATION_GROUPS,
  NAVIGATION_ITEMS,
  type NavigationItem,
} from '@/components/navigation/navigation-config';

export interface NavigationLinksProps {
  readonly onNavigate?: () => void;
  readonly activePathname?: string;
}

export function NavigationLinks({
  onNavigate,
  activePathname,
}: NavigationLinksProps): React.JSX.Element {
  const currentPathname = usePathname() ?? '/';
  const pathname = activePathname ?? currentPathname;

  const isItemActive = (item: NavigationItem): boolean => {
    if (!item.isImplemented || !item.href) return false;
    if (item.href === '/') {
      return pathname === '/';
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <nav className={styles.nav} aria-label="Main Navigation">
      {NAVIGATION_GROUPS.map((group) => {
        const groupItems = NAVIGATION_ITEMS.filter((item) => item.group === group.id);
        if (groupItems.length === 0) return null;

        const headingId = `nav-group-${group.id}`;

        return (
          <div key={group.id} className={styles.group}>
            <h2 id={headingId} className={styles.groupHeading}>
              {group.title}
            </h2>
            <ul className={styles.list} aria-labelledby={headingId}>
              {groupItems.map((item) => {
                const active = isItemActive(item);

                return (
                  <li key={item.id} className={styles.listItem}>
                    {item.isImplemented && item.href ? (
                      <Link
                        href={item.href}
                        className={active ? styles.linkActive : styles.link}
                        {...(active ? { 'aria-current': 'page' as const } : {})}
                        {...(onNavigate ? { onClick: onNavigate } : {})}
                      >
                        <span className={styles.itemLabel}>{item.label}</span>
                      </Link>
                    ) : (
                      <div
                        className={styles.itemDisabled}
                        aria-disabled="true"
                        title={item.description}
                      >
                        <span className={styles.itemLabel}>{item.label}</span>
                        {item.badge && <span className={styles.badge}>{item.badge}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
