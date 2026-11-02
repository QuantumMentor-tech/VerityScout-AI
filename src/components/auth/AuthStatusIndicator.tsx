'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

import { useRouter } from 'next/navigation';
import styles from './AuthStatusIndicator.module.css';

interface UserInfo {
  id: string;
  email: string;
  displayName: string | null;
}

export function AuthStatusIndicator(): React.JSX.Element {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function checkUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (!isMounted) return;
          if (data.authenticated && data.user) {
            setUser(data.user);
          } else {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      } catch {
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void checkUser();

    return () => {
      isMounted = false;
    };
  }, []);


  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // Ignored
    }
    setUser(null);
    router.push('/login');
    router.refresh();
  };

  if (isLoading) {
    return <div className={styles.loadingPlaceholder} aria-hidden="true" />;
  }

  if (user) {
    const displayName = user.displayName || user.email.split('@')[0] || 'User';
    return (
      <div className={styles.userContainer} data-testid="auth-user-menu">
        <span className={styles.userBadge} title={user.email}>
          <span className={styles.avatarIcon} aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className={styles.userName}>{displayName}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          className={styles.signOutButton}
          aria-label="Sign out of VerityScout AI"
        >
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className={styles.guestContainer}>
      <Link href="/login" className={styles.signInLink} aria-label="Sign in to your account">
        Sign In
      </Link>
    </div>
  );
}
