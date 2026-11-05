import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
import { Alert, Badge, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { getDemoRunById, getSourcesForRun, SAMPLE_EVIDENCE_FIXTURE } from '@/fixtures';
import { CandidateEvidenceView } from '@/features/evidence';
import { RunProgressTracker } from '@/features/research';
import { ResearchRunRepository, ResearchTaskRepository, CandidateResultRepository, SourceDocumentRepository, EvidenceRecordRepository, ProgressEventRepository, ModelUsageRepository } from '@/server/persistence/repositories';
import { RunStatus } from '@/server/persistence/types';

interface RunDetailPageProps {
  readonly params: Promise<{
    readonly runId: string;
  }>;
}

export async function generateMetadata({ params }: RunDetailPageProps): Promise<Metadata> {
  const { runId } = await params;
  const demoRun = getDemoRunById(runId);

  if (demoRun) {
    return {
      title: `Run ${demoRun.id} — VerityScout AI`,
      description: `Deterministic verification audit for query: "${demoRun.query}"`,
    };
  }

  try {
    const runRepo = new ResearchRunRepository();
    const dbRun = await runRepo.findById(runId);
    if (dbRun) {
      return {
        title: `Run ${dbRun.id} — VerityScout AI`,
        description: `Asynchronous research run execution for run ${dbRun.id}`,
      };
    }
  } catch {
    // Database lookup failed or in testing environment
  }

  return {
    title: 'Run Not Found — VerityScout AI',
  };
}

export default async function RunDetailPage({ params }: RunDetailPageProps): Promise<React.JSX.Element> {
  const { runId } = await params;
  const demoRun = getDemoRunById(runId);

  // 1. If matching demo fixture exists, render fixture record
  if (demoRun) {
    const sources = getSourcesForRun(demoRun.id);
    const evidenceRecords = SAMPLE_EVIDENCE_FIXTURE.filter((ev) => ev.runId === demoRun.id);

    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/research" className={styles.backLink}>
            &larr; Back to Research Workspace
          </Link>
          <div className={styles.titleArea}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 className={styles.title}>Research Run Detail</h1>
              <Badge variant="brand">{demoRun.id}</Badge>
              <Badge variant="success">{demoRun.status}</Badge>
            </div>
          </div>
          <p className={styles.runQuery}>&ldquo;{demoRun.query}&rdquo;</p>
        </header>

        <Alert variant="info" title="Deterministic Fixture Record">
          This research run detail view is populated from synthetic fixture data (<code>{demoRun.id}</code>). 
          Live BullMQ job streaming, multi-tier evidence extraction, and PostgreSQL persistence are scheduled for Steps 23 through 42.
        </Alert>

        <div className={styles.metaRow}>
          <div><strong>Sources Scanned:</strong> {demoRun.sourcesScanned}</div>
          <div><strong>Candidates Evaluated:</strong> {demoRun.candidatesFound}</div>
          <div><strong>Created At:</strong> {demoRun.createdAt}</div>
          <div><strong>Completed At:</strong> {demoRun.completedAt}</div>
        </div>

        <CandidateEvidenceView
          candidates={demoRun.candidates}
          sources={sources}
          evidenceRecords={evidenceRecords}
        />
      </div>
    );
  }

  // 2. Otherwise look up live database record
  let dbRun = null;
  let task = null;
  let candidates: import('@/server/persistence/types').CandidateResultRow[] = [];
  let sources: import('@/server/persistence/types').SourceDocumentRow[] = [];
  let evidence: import('@/server/persistence/types').EvidenceRecordRow[] = [];
  let progressEvents: import('@/server/persistence/types').ResearchProgressEventRow[] = [];
  let usage: Awaited<ReturnType<ModelUsageRepository['getRunUsageSummary']>> | null = null;

  try {
    const runRepo = new ResearchRunRepository();
    const taskRepo = new ResearchTaskRepository();
    const candidateRepo = new CandidateResultRepository();
    const sourceRepo = new SourceDocumentRepository();
    const evidenceRepo = new EvidenceRecordRepository();
    const progressEventRepo = new ProgressEventRepository();
    const usageRepo = new ModelUsageRepository();

    dbRun = await runRepo.findById(runId);
    if (dbRun) {
      task = await taskRepo.findById(dbRun.task_id);
      const [candRes, srcRes, evRes, evHistory, runUsage] = await Promise.all([
        candidateRepo.listByRunId(runId),
        sourceRepo.listByRunId(runId),
        evidenceRepo.listByRunId(runId),
        progressEventRepo.listByRunId(runId),
        usageRepo.getRunUsageSummary(runId, dbRun.user_id),
      ]);
      candidates = candRes.data;
      sources = srcRes.data;
      evidence = evRes.data;
      progressEvents = evHistory;
      usage = runUsage;
    }
  } catch {
    // Non-fatal, handled by notFound check below
  }

  if (!dbRun) {
    notFound();
  }

  const queryText = task?.original_query || 'Asynchronous Research Run';
  const statusVariant: 'success' | 'danger' | 'brand' =
    dbRun.status === RunStatus.COMPLETED
      ? 'success'
      : dbRun.status === RunStatus.FAILED || dbRun.status === RunStatus.CANCELLED
      ? 'danger'
      : 'brand';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/research" className={styles.backLink}>
          &larr; Back to Research Workspace
        </Link>
        <div className={styles.titleArea}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h1 className={styles.title}>Research Run Detail</h1>
            <Badge variant="brand">{dbRun.id.slice(0, 8)}</Badge>
            <Badge variant={statusVariant}>{dbRun.status}</Badge>
            <Badge variant="neutral">{dbRun.current_stage}</Badge>
          </div>
        </div>
        <p className={styles.runQuery}>&ldquo;{queryText}&rdquo;</p>
      </header>

      <RunProgressTracker
        runId={dbRun.id}
        initialStatus={dbRun.status}
        initialStage={dbRun.current_stage}
        initialProgressPercent={dbRun.progress_percent ?? 0}
        initialEvents={progressEvents.map((e) => ({
          id: e.id,
          stage: e.stage,
          eventType: e.event_type,
          sequenceNumber: e.sequence_number,
          message: e.message,
          createdAt: e.created_at,
        }))}
      />

      {dbRun.status === RunStatus.FAILED && (
        <Alert variant="danger" title="Research Run Failed">
          {dbRun.error_message || 'A fatal error occurred during pipeline execution.'}
        </Alert>
      )}

      <div className={styles.metaRow}>
        <div><strong>Queries Executed:</strong> {dbRun.stage_counters?.queriesExecuted ?? 0}</div>
        <div><strong>Sources Discovered:</strong> {dbRun.stage_counters?.sourcesDiscovered ?? 0}</div>
        <div><strong>Sources Extracted:</strong> {dbRun.stage_counters?.sourcesExtracted ?? 0}</div>
        <div><strong>Claims Verified:</strong> {dbRun.stage_counters?.claimsVerified ?? 0}</div>
        <div><strong>Started At:</strong> {new Date(dbRun.started_at).toLocaleString()}</div>
        <div><strong>Completed At:</strong> {dbRun.completed_at ? new Date(dbRun.completed_at).toLocaleString() : 'In Progress'}</div>
      </div>

      {usage && usage.totalRequests > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Card variant="default">
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <CardTitle as="h2">AI Model Usage &amp; Cost Accounting</CardTitle>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Badge variant="neutral">{usage.totalRequests} operations</Badge>
                  {usage.totalEstimatedCostUsd !== null ? (
                    <Badge variant={usage.unknownCostRequests > 0 ? 'neutral' : 'brand'}>
                      {`$${Number(usage.totalEstimatedCostUsd).toFixed(4)} USD`}
                      {usage.unknownCostRequests > 0 && ' (partial)'}
                    </Badge>
                  ) : (
                    <Badge variant="neutral">Cost Unknown</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className={styles.metaRow} style={{ marginBottom: 'var(--space-4)' }}>
                <div><strong>Total Tokens:</strong> {usage.totalTokens.toLocaleString()}</div>
                <div><strong>Prompt Tokens:</strong> {usage.totalInputTokens.toLocaleString()}</div>
                <div><strong>Completion Tokens:</strong> {usage.totalOutputTokens.toLocaleString()}</div>
                <div><strong>Cached Tokens:</strong> {usage.cachedTokens.toLocaleString()}</div>
                <div><strong>Reasoning Tokens:</strong> {usage.reasoningTokens.toLocaleString()}</div>
                <div>
                  <strong>Cost Status:</strong>{' '}
                  {usage.unknownCostRequests > 0 ? (
                    <span style={{ color: 'var(--color-warning)' }}>Partial / Unpriced Models</span>
                  ) : usage.totalEstimatedCostUsd ? (
                    <span>Provider-Aware Estimated</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)' }}>Free-Tier / Self-Hosted</span>
                  )}
                </div>
              </div>

              {Object.keys(usage.byOperation).length > 0 && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <h4 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    Usage by Operation
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
                    {Object.entries(usage.byOperation).map(([op, data]) => (
                      <div
                        key={op}
                        style={{
                          padding: 'var(--space-3)',
                          backgroundColor: 'var(--color-surface-subtle)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        <div style={{ fontWeight: 600, textTransform: 'capitalize', marginBottom: 'var(--space-1)' }}>
                          {op.replace(/_/g, ' ')}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          Calls: {data.requests} | Tokens: {(data.inputTokens + data.outputTokens).toLocaleString()}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginTop: 'var(--space-1)' }}>
                          Cost: {data.estimatedCostUsd !== null ? `$${Number(data.estimatedCostUsd).toFixed(5)}` : 'Unknown'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {dbRun.synthesis && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <Card variant="default">
            <CardHeader>
              <CardTitle as="h2">Evidence-Linked Research Synthesis</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ lineHeight: 'var(--line-height-relaxed)', color: 'var(--color-text-primary)' }}>
                {(dbRun.synthesis as { summaryMarkdown?: string }).summaryMarkdown ||
                  (dbRun.synthesis as { directAnswer?: string }).directAnswer ||
                  (dbRun.synthesis as { answerText?: string }).answerText ||
                  JSON.stringify(dbRun.synthesis, null, 2)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <CandidateEvidenceView
            candidates={candidates.map((c) => ({
              id: c.id,
              name: c.title,
              price: c.price_usd ? `$${c.price_usd}` : 'N/A',
              retailer: c.seller_or_domain,
              url: c.canonical_url,
              verifiedAttributes: Object.entries(c.specifications).map(([key, val]) => ({
                key,
                value: String(val),
                matchesConstraint: true,
              })),
              tier: (c.classification === 'EXACT_MATCH'
                ? 'Strong Match'
                : c.classification === 'NEAR_MATCH'
                ? 'Near Match'
                : 'Partially Verified') as 'Strong Match' | 'Near Match' | 'Partially Verified',
            }))}
            sources={sources.map((s) => ({
              id: s.id,
              runId: s.run_id,
              originalUrl: s.original_url,
              canonicalUrl: s.canonical_url,
              domain: s.domain,
              title: s.title,
              discoveryProvider: s.discovery_provider,
              accessState: s.access_state,
              extractionState: s.extraction_state,
              httpStatusCode: s.http_status_code ?? undefined,
              contentHash: s.content_hash ?? undefined,
              extractedTextExcerpt: s.extracted_text_excerpt,
              retrievedAt: s.retrieved_at,
              publishedAt: s.published_at ?? undefined,
            }))}
            evidenceRecords={evidence.map((e) => ({
              id: e.id,
              runId: e.run_id,
              sourceId: e.source_id,
              candidateId: e.candidate_id ?? undefined,
              claimKey: e.claim_key,
              extractedRawValue: e.extracted_raw_value,
              normalizedValue: e.normalized_value,
              unitOrCurrency: e.unit_or_currency ?? undefined,
              verbatimQuote: e.verbatim_quote,
              verificationState: e.verification_state,
              conflictDetails: e.conflict_details ?? undefined,
              extractionMethod: e.extraction_method,
              locationInDocument: e.location_in_document ?? undefined,
              confidenceScore: e.confidence_score ? parseFloat(e.confidence_score) : 1.0,
              extractedAt: e.extracted_at,
            }))}
          />
        </div>
      )}
    </div>
  );
}
