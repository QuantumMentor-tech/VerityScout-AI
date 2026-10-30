import Image from 'next/image';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <article className={styles.card}>
        <div className={styles.logoWrapper}>
          <Image
            src="/logo.png"
            alt="VerityScout AI Emblem"
            width={64}
            height={64}
            className={styles.logo}
            priority
          />
        </div>

        <h1 className={styles.title}>VerityScout AI</h1>
        <p className={styles.subtitle}>
          Autonomous Multi-Source Web Research & Deterministic Verification Platform
        </p>

        <div className={styles.badge} role="status">
          <span className={styles.statusIndicator} aria-hidden="true" />
          <span>Foundation Initialized & Verified</span>
        </div>

        <section className={styles.noticeBox} aria-labelledby="status-heading">
          <h2 id="status-heading" className={styles.noticeHeading}>
            Current Implementation Status (Step 6 of 60)
          </h2>
          <p>
            The project foundation, TypeScript toolchain, and Next.js App Router baseline are active. 
            Requirements, evaluation benchmarks, provider research, security threat modeling, and data contracts 
            have been frozen.
          </p>
          <p style={{ marginTop: '0.75rem' }}>
            <strong>Note:</strong> The research execution engine, web scrapers, and external AI integrations are 
            scheduled for subsequent implementation phases. No live external searches or API calls are active in this step.
          </p>
        </section>

        <footer className={styles.footer}>
          <span>VerityScout AI &bull; Phase 2 Baseline</span>
        </footer>
      </article>
    </main>
  );
}
