import Link from 'next/link';
import styles from './page.module.css';

export default function NotFound() {
  return (
    <main className={styles.main}>
      <article className={styles.card} role="region" aria-label="Page Not Found">
        <h1 className={styles.title}>404 — Page Not Found</h1>
        <p className={styles.subtitle}>
          The requested route does not exist in VerityScout AI.
        </p>

        <section className={styles.noticeBox} aria-label="Not Found Details">
          <p>
            Please check the URL or navigate back to the primary application interface.
          </p>
        </section>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <Link
            href="/"
            style={{
              padding: '0.625rem 1.25rem',
              backgroundColor: 'var(--color-accent-cyan, #06b6d4)',
              color: '#080d1a',
              textDecoration: 'none',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            Return to Home
          </Link>
        </div>
      </article>
    </main>
  );
}
