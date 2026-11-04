import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button } from '@/components/ui';
import { DEMO_RUNS } from '@/fixtures';
import { ResearchWorkspaceClient } from '@/features/research';

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
          <Badge variant="brand">Step 16 Active</Badge>
        </div>
        <p className={styles.subtitle}>
          Autonomous query intake, multi-dimensional constraint definition, and live execution staging.
        </p>
      </header>

      <Alert variant="info" title="Research Workflow Staging Notice">
        Interactive natural-language query intake with local validation is active (Step 16).
        Multi-dimensional constraint extraction cards will connect in Step 17.
        Live external search queries and worker execution pipeline begin in Step 18+ and Step 43.
      </Alert>

      <div className={styles.workspaceGrid}>
        <div className={styles.composerColumn}>
          <ResearchWorkspaceClient />
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
