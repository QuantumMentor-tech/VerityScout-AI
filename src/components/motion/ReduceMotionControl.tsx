'use client';

import React, { useEffect, useState, useCallback } from 'react';
import styles from './ReduceMotionControl.module.css';

export const REDUCE_MOTION_STORAGE_KEY = 'verityscout:reduce-motion';

export interface ReduceMotionControlProps {
  className?: string;
}

export function ReduceMotionControl({ className }: ReduceMotionControlProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [systemPrefersReduced, setSystemPrefersReduced] = useState(false);
  const [userPrefersReduced, setUserPrefersReduced] = useState(false);

  // Synchronize DOM root attribute with effective motion state
  const syncDomAttributes = useCallback((shouldReduce: boolean) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (shouldReduce) {
      root.setAttribute('data-reduce-motion', 'true');
      root.removeAttribute('data-motion-allowed');
    } else {
      root.removeAttribute('data-reduce-motion');
      root.setAttribute('data-motion-allowed', 'true');
    }
  }, []);

  // Safe localStorage reading
  const readStoredPreference = useCallback((): boolean => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const stored = window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  }, []);

  // Safe localStorage writing
  const writeStoredPreference = useCallback((value: boolean): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(value));
    } catch {
      // Graceful degradation when storage is blocked
    }
  }, []);

  // Hydration-safe client initialization
  useEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    let initialSystem = false;

    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        initialSystem = mediaQuery.matches;
      }
    } catch {
      initialSystem = false;
    }

    const initialUser = readStoredPreference();

    setSystemPrefersReduced(initialSystem);
    setUserPrefersReduced(initialUser);
    setIsInitialized(true);

    const effectiveReduce = initialSystem || initialUser;
    syncDomAttributes(effectiveReduce);

    // Listen for operating system preference changes
    const handleMediaChange = (event: MediaQueryListEvent) => {
      const systemNow = event.matches;
      setSystemPrefersReduced(systemNow);
      const effectiveNow = systemNow || initialUser;
      syncDomAttributes(effectiveNow);
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    return () => {
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
    };
  }, [readStoredPreference, syncDomAttributes]);

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    // If operating system has requested reduced motion, in-app toggle cannot override it
    if (systemPrefersReduced) return;

    const newPreference = e.target.checked;
    setUserPrefersReduced(newPreference);
    writeStoredPreference(newPreference);
    syncDomAttributes(newPreference);
  };

  const isEffectiveReduced = systemPrefersReduced || userPrefersReduced;

  return (
    <div className={`${styles.container} ${className || ''}`}>
      <label
        className={`${styles.label} ${systemPrefersReduced ? styles.disabled : ''}`}
        htmlFor="reduce-motion-toggle"
      >
        <span className={styles.toggleWrapper}>
          <input
            id="reduce-motion-toggle"
            type="checkbox"
            className={styles.checkbox}
            checked={isInitialized ? isEffectiveReduced : false}
            onChange={handleToggle}
            disabled={systemPrefersReduced}
            aria-describedby="reduce-motion-hint"
          />
          <span className={styles.toggleTrack} aria-hidden="true">
            <span className={styles.toggleThumb} />
          </span>
        </span>
        <span className={styles.labelText}>Reduce motion</span>
      </label>
      <p id="reduce-motion-hint" className={styles.hint}>
        {systemPrefersReduced
          ? 'System preference active (Reduce motion enabled in OS)'
          : isEffectiveReduced
          ? 'Decorative animation disabled'
          : 'Disables decorative brand gradient animation'}
      </p>
    </div>
  );
}
