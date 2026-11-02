import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
import { Alert, Badge } from '@/components/ui';
import { getDemoRunById, getSourcesForRun, SAMPLE_EVIDENCE_FIXTURE } from '@/fixtures';
import { CandidateEvidenceView } from '@/features/evidence';

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

  const sources = getSourcesForRun(run.id);
  const evidenceRecords = SAMPLE_EVIDENCE_FIXTURE.filter((ev) => ev.runId === run.id);

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

      <CandidateEvidenceView
        candidates={run.candidates}
        sources={sources}
        evidenceRecords={evidenceRecords}
      />
    </div>
  );
}
