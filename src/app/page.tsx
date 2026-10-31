import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import { ReduceMotionControl } from '@/components/motion/ReduceMotionControl';
import { Alert, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { OVERVIEW_METRICS_FIXTURE, OVERVIEW_ACTIVITIES_FIXTURE } from '@/fixtures';

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

        <div className={styles.motionControlWrapper}>
          <ReduceMotionControl />
        </div>

        <footer className={styles.footer}>
          <span>VerityScout AI &bull; Phase 2 Baseline</span>
        </footer>
      </article>

      {/* Step 15 Overview Extension: Sample Metrics & Recent Activity */}
      <section className={styles.overviewSection} aria-label="Workspace Sample Summaries">
        <Alert variant="info" title="Sample Data Preview">
          The summaries and activity records below are illustrative fixtures for interface evaluation.
          Live research execution, search providers, and database persistence begin in Step 16+.
        </Alert>

        <div className={styles.metricsGrid}>
          {OVERVIEW_METRICS_FIXTURE.map((metric) => (
            <Card key={metric.id} variant="subtle">
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {metric.label}
                  </span>
                  {metric.badge && <Badge size="sm" variant="brand">{metric.badge}</Badge>}
                </div>
              </CardHeader>
              <CardContent>
                <div className={styles.metricValue}>{metric.value}</div>
                {metric.change && <div className={styles.metricChange}>{metric.change}</div>}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card variant="default">
          <CardHeader>
            <CardTitle as="h2">Recent Simulated Research Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className={styles.activityList}>
              {OVERVIEW_ACTIVITIES_FIXTURE.map((act) => (
                <li key={act.id} className={styles.activityItem}>
                  <div className={styles.activityMeta}>
                    <span style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
                      {act.title}
                    </span>
                    <span className={styles.activityTarget}>{act.target}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Badge variant={act.status === 'completed' ? 'success' : 'neutral'} size="sm">
                      {act.status}
                    </Badge>
                    {act.runId && (
                      <Link
                        href={`/research/runs/${act.runId}`}
                        style={{ fontSize: 'var(--font-size-xs)', textDecoration: 'underline' }}
                      >
                        Inspect Run
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
