import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { getDemoRunById } from '@/fixtures';

interface RunDetailPageProps {
  readonly params: Promise<{
    readonly runId: string;
  }>;
}

export async function generateMetadata({ params }: RunDetailPageProps): Promise<Metadata> {
  const { runId } = await params;
  const run = getDemoRunById(runId);

  if (!run) {
    return {
      title: 'Run Not Found — VerityScout AI',
    };
  }

  return {
    title: `Run ${run.id} — VerityScout AI`,
    description: `Deterministic verification audit for query: "${run.query}"`,
  };
}

export default async function RunDetailPage({ params }: RunDetailPageProps): Promise<React.JSX.Element> {
  const { runId } = await params;
  const run = getDemoRunById(runId);

  if (!run) {
    notFound();
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/research" className={styles.backLink}>
          &larr; Back to Research Workspace
        </Link>
        <div className={styles.titleArea}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h1 className={styles.title}>Research Run Detail</h1>
            <Badge variant="brand">{run.id}</Badge>
            <Badge variant="success">{run.status}</Badge>
          </div>
        </div>
        <p className={styles.runQuery}>&ldquo;{run.query}&rdquo;</p>
      </header>

      <Alert variant="info" title="Deterministic Fixture Record">
        This research run detail view is populated from synthetic fixture data (<code>{run.id}</code>). 
        Live BullMQ job streaming, multi-tier evidence extraction, and PostgreSQL persistence are scheduled for Steps 23 through 42.
      </Alert>

      <div className={styles.metaRow}>
        <div><strong>Sources Scanned:</strong> {run.sourcesScanned}</div>
        <div><strong>Candidates Evaluated:</strong> {run.candidatesFound}</div>
        <div><strong>Created At:</strong> {run.createdAt}</div>
        <div><strong>Completed At:</strong> {run.completedAt}</div>
      </div>

      <section>
        <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-4)', color: 'var(--color-text-primary)' }}>
          Verified Candidate Results ({run.candidates.length})
        </h2>

        <div className={styles.candidatesList}>
          {run.candidates.map((cand) => (
            <Card key={cand.id} variant="default">
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div>
                    <CardTitle as="h3">{cand.name}</CardTitle>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Retailer: {cand.retailer}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)' }}>
                    <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-accent-cyan-text)' }}>
                      {cand.price}
                    </span>
                    <Badge variant={cand.tier === 'Strong Match' ? 'success' : 'warning'} size="sm">
                      {cand.tier}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className={styles.attributeGrid}>
                  {cand.verifiedAttributes.map((attr, idx) => (
                    <div key={idx} className={styles.attributeItem}>
                      <span className={styles.attributeKey}>{attr.key}</span>
                      <span className={styles.attributeValue}>
                        {attr.value} {attr.matchesConstraint ? '✓' : '✗'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
