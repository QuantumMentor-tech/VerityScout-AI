'use client';

import { useEffect } from 'react';
import styles from './page.module.css';

interface ErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Note: error digest or safe reference can be logged to server if needed
    // We intentionally avoid printing full raw error object to browser console
  }, [error]);

  return (
    <main className={styles.main}>
      <article className={styles.card} role="alert">
        <h1 className={styles.title}>Something Went Wrong</h1>
        <p className={styles.subtitle}>
          An unexpected operational error occurred while processing your request.
        </p>

        <section className={styles.noticeBox} aria-label="Error Notice">
          <p>
            The incident has been isolated. Technical details and stack traces have been suppressed to protect system security.
          </p>
        </section>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: 'var(--color-accent-cyan, #06b6d4)',
              color: '#080d1a',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      </article>
    </main>
  );
}
