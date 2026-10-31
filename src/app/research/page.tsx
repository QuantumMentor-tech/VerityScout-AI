import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button } from '@/components/ui';
import { DEMO_RUNS } from '@/fixtures';

export const metadata: Metadata = {
  title: 'Research Workspace — VerityScout AI',
  description: 'Autonomous research query configuration and hard-constraint verification workspace.',
};

export default function ResearchPage(): React.JSX.Element {
  const sampleRun = DEMO_RUNS['demo-run-001'];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h1 className={styles.title}>Research Workspace</h1>
          <Badge variant="brand">Step 15 Shell</Badge>
        </div>
        <p className={styles.subtitle}>
          Autonomous query intake, multi-dimensional constraint definition, and live execution staging.
        </p>
      </header>

      <Alert variant="info" title="Sample Data & Scaffolding Notice">
        This is a page-level shell preview. Functional query intake begins in Step 16 (Natural-Language Query Composer), 
        followed by Step 17 (Multi-Dimensional Constraints Editor). No live external search queries or model requests occur on this page.
      </Alert>

      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderBox}>
          <svg
            style={{ width: '48px', height: '48px', color: 'var(--palette-slate-500)', marginBottom: 'var(--space-4)' }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
            Query Composer Reserved Region
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', maxWidth: '400px', marginTop: 'var(--space-2)' }}>
            Step 16 introduces the interactive natural-language query composer with prompt auto-expansion 
            and Step 17 adds deterministic constraint verification cards.
          </p>
        </div>

        <div className={styles.sampleRunCard}>
          <Card variant="default">
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <CardTitle as="h3">Sample Run Preview</CardTitle>
                <Badge variant="success" size="sm">Deterministic Fixture</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', fontWeight: 'var(--font-weight-medium)' }}>
                {sampleRun?.query}
              </p>
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                <div><strong>Run ID:</strong> <code>{sampleRun?.id}</code></div>
                <div><strong>Sources Scanned:</strong> {sampleRun?.sourcesScanned} web pages</div>
                <div><strong>Verified Candidates:</strong> {sampleRun?.candidatesFound} results</div>
              </div>
            </CardContent>
            <CardFooter>
              <Link href={`/research/runs/${sampleRun?.id}`}>
                <Button variant="secondary" size="sm">
                  View Full Run Shell
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
