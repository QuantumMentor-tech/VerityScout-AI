'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Alert,
  Input,
  FormField,
} from '@/components/ui';
import { ChangeHistoryList } from '@/features/changes';
import type { ChangeItem, ChangeSummaryMetrics } from '@/features/changes';

interface ScheduleItem {
  readonly id: string;
  readonly name: string | null;
  readonly revision: number;
  readonly status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DISABLED_ERROR';
  readonly cron_expression: string;
  readonly scheduled_time: string | null;
  readonly timezone: string;
  readonly next_run_at: string | null;
  readonly last_run_at: string | null;
  readonly last_dispatched_at: string | null;
  readonly last_run_id: string | null;
  readonly description?: string | undefined;
  readonly request_snapshot?: {
    query?: string | undefined;
    taskType?: string | undefined;
  } | undefined;
}

interface OccurrenceItem {
  readonly id: string;
  readonly scheduled_at: string;
  readonly status: string;
  readonly dispatched_at: string | null;
  readonly research_run_id: string | null;
  readonly error_message: string | null;
  readonly schedule_revision: number;
}

export function ScheduleManager(): React.JSX.Element {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Occurrence viewing state
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceItem[]>([]);
  const [occurrencesLoading, setOccurrencesLoading] = useState(false);

  // Changes viewing state
  const [changesScheduleId, setChangesScheduleId] = useState<string | null>(null);
  const [changesList, setChangesList] = useState<ChangeItem[]>([]);
  const [changesSummary, setChangesSummary] = useState<ChangeSummaryMetrics | undefined>(undefined);
  const [changesLoading, setChangesLoading] = useState(false);

  // Editing state
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuery, setEditQuery] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchSchedules = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/schedules');
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules ?? []);
      }
    } catch {
      // Gracefully handle unauthenticated or offline preview
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  const handlePause = async (id: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/schedules/${id}/pause`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to pause schedule');
        return;
      }
      setActionSuccess('Schedule paused successfully. Future occurrences will not dispatch.');
      await fetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const handleResume = async (id: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/schedules/${id}/resume`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to resume schedule');
        return;
      }
      setActionSuccess('Schedule resumed successfully. Next run recalculated.');
      await fetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const handleRetire = async (id: string) => {
    if (!window.confirm('Retiring this schedule stops all future automated executions. Past research runs, occurrences, and evidence will be preserved. Proceed?')) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to retire schedule');
        return;
      }
      setActionSuccess('Schedule retired. Historical data preserved.');
      await fetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    }
  };

  const startEdit = (s: ScheduleItem) => {
    setEditingScheduleId(s.id);
    setEditName(s.name ?? '');
    setEditQuery(s.request_snapshot?.query ?? '');
    setActionError(null);
    setActionSuccess(null);
  };

  const saveEdit = async (s: ScheduleItem) => {
    setIsSavingEdit(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          query: editQuery || undefined,
          expectedRevision: s.revision,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? 'Failed to save changes');
        return;
      }
      setActionSuccess('Schedule definition updated (new revision created).');
      setEditingScheduleId(null);
      await fetchSchedules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const viewOccurrences = async (id: string) => {
    if (selectedScheduleId === id) {
      setSelectedScheduleId(null);
      return;
    }
    setSelectedScheduleId(id);
    setOccurrencesLoading(true);
    try {
      const res = await fetch(`/api/schedules/${id}/occurrences?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setOccurrences(data.occurrences ?? []);
      }
    } catch {
      setOccurrences([]);
    } finally {
      setOccurrencesLoading(false);
    }
  };

  const viewChanges = async (id: string) => {
    if (changesScheduleId === id) {
      setChangesScheduleId(null);
      return;
    }
    setChangesScheduleId(id);
    setChangesLoading(true);
    try {
      const res = await fetch(`/api/schedules/${id}/changes?limit=50`);
      if (res.ok) {
        const data = await res.json();
        const mappedChanges: ChangeItem[] = (data.latestChanges ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.id ?? ''),
          candidateTitle: String(c.candidate_title ?? 'Unknown Candidate'),
          canonicalUrl: c.canonical_url ? String(c.canonical_url) : undefined,
          fieldName: String(c.field_name ?? 'attribute'),
          changeType: String(c.change_type ?? 'CHANGED'),
          changeStatus: c.change_status ? String(c.change_status) : undefined,
          reasonCode: c.reason_code ? String(c.reason_code) : undefined,
          previousValue: String(c.previous_value ?? ''),
          newValue: String(c.new_value ?? ''),
          percentageDelta: c.percentage_delta != null ? Number(c.percentage_delta) : null,
          evidenceId: c.evidence_id ? String(c.evidence_id) : null,
          baselineEvidenceId: c.baseline_evidence_id ? String(c.baseline_evidence_id) : null,
          explanation: c.explanation ? String(c.explanation) : undefined,
          detectedAt: c.detected_at ? String(c.detected_at) : undefined,
        }));
        setChangesList(mappedChanges);
        setChangesSummary(data.latestComparison?.summary as ChangeSummaryMetrics | undefined);
      }
    } catch {
      setChangesList([]);
      setChangesSummary(undefined);
    } finally {
      setChangesLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Active</Badge>;
      case 'PAUSED':
        return <Badge variant="warning">Paused</Badge>;
      case 'ARCHIVED':
        return <Badge variant="neutral">Retired</Badge>;
      case 'DISABLED_ERROR':
        return <Badge variant="danger">Disabled (Errors)</Badge>;
      case 'PLANNED':
        return <Badge variant="neutral">Planned</Badge>;
      case 'DISPATCHING':
        return <Badge variant="brand">Dispatching</Badge>;
      case 'DISPATCHED':
        return <Badge variant="brand">Dispatched</Badge>;
      case 'RUNNING':
        return <Badge variant="brand">Running</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Failed</Badge>;
      case 'SKIPPED':
        return <Badge variant="neutral">Skipped</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}>Loading persistent schedules...</div>;
  }

  if (schedules.length === 0) {
    return <></>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>Active Research Schedules</h2>
        <Badge variant="brand">{schedules.length} Persistent Schedule(s)</Badge>
      </div>

      {actionError && (
        <Alert variant="danger" title="Schedule Action Error">
          {actionError}
        </Alert>
      )}

      {actionSuccess && (
        <Alert variant="success" title="Success">
          {actionSuccess}
        </Alert>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-4)' }}>
        {schedules.map((s) => (
          <Card key={s.id} variant="default">
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <CardTitle as="h3">{s.name || 'Unnamed Research Schedule'}</CardTitle>
                <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                  {getStatusBadge(s.status)}
                  <Badge variant="neutral" size="sm">v{s.revision}</Badge>
                </div>
              </div>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {s.description || `${s.cron_expression} (${s.timezone})`}
              </span>
            </CardHeader>

            <CardContent>
              {editingScheduleId === s.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <FormField label="Schedule Name" htmlFor={`edit-name-${s.id}`}>
                    <Input
                      id={`edit-name-${s.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Research Query" htmlFor={`edit-query-${s.id}`}>
                    <Input
                      id={`edit-query-${s.id}`}
                      value={editQuery}
                      onChange={(e) => setEditQuery(e.target.value)}
                    />
                  </FormField>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button size="sm" variant="primary" disabled={isSavingEdit} onClick={() => void saveEdit(s)}>
                      {isSavingEdit ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingScheduleId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div><strong>Query:</strong> {s.request_snapshot?.query || '(Not specified)'}</div>
                  <div><strong>Timezone:</strong> <code>{s.timezone}</code></div>
                  <div><strong>Next Run:</strong> {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : 'Ended/None'}</div>
                  <div><strong>Last Dispatched:</strong> {s.last_dispatched_at ? new Date(s.last_dispatched_at).toLocaleString() : 'Never'}</div>
                </div>
              )}
            </CardContent>

            <CardFooter>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', width: '100%', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  {s.status === 'ACTIVE' && (
                    <Button size="sm" variant="outline" onClick={() => void handlePause(s.id)}>
                      Pause
                    </Button>
                  )}
                  {s.status === 'PAUSED' && (
                    <Button size="sm" variant="primary" onClick={() => void handleResume(s.id)}>
                      Resume
                    </Button>
                  )}
                  {s.status !== 'ARCHIVED' && (
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={selectedScheduleId === s.id ? 'primary' : 'outline'}
                    onClick={() => void viewOccurrences(s.id)}
                  >
                    Occurrences
                  </Button>
                  <Button
                    size="sm"
                    variant={changesScheduleId === s.id ? 'primary' : 'outline'}
                    onClick={() => void viewChanges(s.id)}
                  >
                    Changes
                  </Button>
                </div>
                {s.status !== 'ARCHIVED' && (
                  <Button size="sm" variant="danger" onClick={() => void handleRetire(s.id)}>
                    Retire
                  </Button>
                )}
              </div>
            </CardFooter>

            {/* Expandable Changes View */}
            {changesScheduleId === s.id && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--space-3)', backgroundColor: 'var(--bg-subtle)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  Detected Observation Changes
                </h4>
                <ChangeHistoryList
                  changes={changesList}
                  summary={changesSummary}
                  isLoading={changesLoading}
                  onRefresh={() => void viewChanges(s.id)}
                />
              </div>
            )}

            {/* Expandable Occurrence Ledger View */}
            {selectedScheduleId === s.id && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--space-3)', backgroundColor: 'var(--bg-subtle)' }}>
                <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  Recent Execution Occurrences
                </h4>
                {occurrencesLoading ? (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>Loading occurrences ledger...</div>
                ) : occurrences.length === 0 ? (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>No recorded occurrences yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {occurrences.map((occ) => (
                      <div
                        key={occ.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 'var(--font-size-xs)',
                          padding: 'var(--space-2)',
                          backgroundColor: 'var(--bg-canvas)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div>
                          <div><strong>Scheduled:</strong> {new Date(occ.scheduled_at).toLocaleString()}</div>
                          {occ.research_run_id && (
                            <div>
                              <strong>Run:</strong>{' '}
                              <Link href={`/research/runs/${occ.research_run_id}`} style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
                                <code>{occ.research_run_id.slice(0, 8)}</code>
                              </Link>
                            </div>
                          )}
                          {occ.error_message && (
                            <div style={{ color: 'var(--danger-text)' }}>{occ.error_message}</div>
                          )}
                        </div>
                        <div>{getStatusBadge(occ.status)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
