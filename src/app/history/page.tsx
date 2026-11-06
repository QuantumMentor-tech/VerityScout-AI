import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardContent, CardFooter, Badge, Button } from '@/components/ui';
import { ResearchHistoryList } from '@/features/history';
import { HISTORY_RECORDS_FIXTURE } from '@/fixtures';

export const metadata: Metadata = {
  title: 'Research History — VerityScout AI',
  description: 'Audit trail of past research runs, candidate evaluations, and verification timestamps.',
};

export default function HistoryPage(): React.JSX.Element {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h1 className={styles.title}>Research History</h1>
          <Badge variant="brand">Step 49</Badge>
        </div>
        <p className={styles.subtitle}>
          Searchable audit trail of past research runs, candidate evaluations, and exportable findings.
        </p>
      </header>

      {/* Interactive History List with Filters & JSON/CSV/Markdown Exports */}
      <ResearchHistoryList />

      {/* Sample History Preview */}
      <Alert variant="info" title="Sample History Preview">
        The history entries shown below are synthetic benchmark fixtures. 
        Use the controls above to search and export your live, persistent research history.
      </Alert>

      <div className={styles.historyList}>
        {HISTORY_RECORDS_FIXTURE.map((record) => (
          <Card key={record.id} variant="default">
            <CardHeader>
              <div className={styles.itemHeader}>
                <div>
                  <h2 className={styles.itemQuery}>{record.query}</h2>
                  <div className={styles.itemMeta}>
                    <span>ID: <code>{record.id}</code></span>
                    <span>Executed: {record.timestamp}</span>
                    <span>Duration: {record.durationSeconds}s</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Badge variant="success" size="sm">{record.matchRate}</Badge>
                  <Badge variant="neutral" size="sm">{record.candidatesFound} Candidates</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Synthetic record captured under the 60-case ground-truth evaluation benchmark rubric.
              </p>
            </CardContent>
            <CardFooter>
              <Link href={`/research/runs/${record.runId}`}>
                <Button variant="secondary" size="sm">
                  Inspect Audit Trail
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
