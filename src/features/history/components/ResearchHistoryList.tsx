'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import styles from './ResearchHistoryList.module.css';
import { HistoryRecord, HistoryFilters } from '../types';
import { ExportToolbar } from './ExportToolbar';

export interface ResearchHistoryListProps {
  readonly initialFilters?: HistoryFilters | undefined;
}

export const ResearchHistoryList: React.FC<ResearchHistoryListProps> = ({
  initialFilters,
}) => {
  const [runs, setRuns] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [query, setQuery] = useState(initialFilters?.query ?? '');
  const [status, setStatus] = useState(initialFilters?.status ?? 'ALL');
  const [taskType, setTaskType] = useState(initialFilters?.taskType ?? 'ALL');
  const [page, setPage] = useState(initialFilters?.page ?? 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '15');
      if (query.trim()) params.set('query', query.trim());
      if (status !== 'ALL') params.set('status', status);
      if (taskType !== 'ALL') params.set('taskType', taskType);

      const res = await fetch(`/api/research/history?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to load research history');
      }

      const data = await res.json();
      setRuns(data.runs ?? []);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotalCount(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading history');
      setRuns([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, query, status, taskType]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchHistory();
  };

  const getStatusBadgeClass = (runStatus: string): string => {
    switch (runStatus) {
      case 'COMPLETED':
        return styles.badgeSuccess ?? '';
      case 'FAILED':
        return styles.badgeFailed ?? '';
      case 'RUNNING':
        return styles.badgeRunning ?? '';
      default:
        return styles.badgeDefault ?? '';
    }
  };

  return (
    <div className={styles.container}>
      {/* Search and Filters Bar */}
      <form onSubmit={handleSearchSubmit} className={styles.filterBar}>
        <div className={styles.inputsGroup}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search query, product, or task title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className={styles.selectInput}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="RUNNING">Running</option>
            <option value="QUEUED">Queued</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="PARTIALLY_COMPLETED">Partially Completed</option>
          </select>
          <select
            className={styles.selectInput}
            value={taskType}
            onChange={(e) => {
              setTaskType(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All Task Types</option>
            <option value="PRODUCT_RESEARCH">Product Research</option>
            <option value="PRICE_MONITOR">Price Monitor</option>
            <option value="SPEC_VERIFICATION">Spec Verification</option>
            <option value="GENERAL_RESEARCH">General Research</option>
          </select>
        </div>

        {/* Global Filtered History Export */}
        <ExportToolbar
          isHistoryExport={true}
          queryParams={{
            query: query.trim() || undefined,
            status: status !== 'ALL' ? status : undefined,
            taskType: taskType !== 'ALL' ? taskType : undefined,
          }}
        />
      </form>

      {/* Loading & Error States */}
      {isLoading && (
        <div className={styles.emptyState}>
          <p>Retrieving research audit trail...</p>
        </div>
      )}

      {error && (
        <div className={styles.emptyState} style={{ borderColor: '#f87171', color: '#b91c1c' }}>
          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && runs.length === 0 && (
        <div className={styles.emptyState}>
          <h3>No Research Records Found</h3>
          <p>Try adjusting your search query, status filters, or date range.</p>
        </div>
      )}

      {/* History List */}
      {!isLoading && runs.length > 0 && (
        <div className={styles.historyList}>
          {runs.map((run) => (
            <div key={run.runId} className={styles.historyCard}>
              <div className={styles.cardHeader}>
                <div>
                  <Link href={`/research/runs/${run.runId}`} className={styles.queryTitle}>
                    {run.taskTitle || run.query}
                  </Link>
                  <div className={styles.metaRow} style={{ marginTop: '0.25rem' }}>
                    <span>ID: <code>{run.runId.slice(0, 8)}</code></span>
                    <span>Executed: {new Date(run.startedAt).toLocaleString()}</span>
                    {run.durationMs != null && (
                      <span>Duration: {(run.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    {run.scheduleName && (
                      <span>Schedule: <strong>{run.scheduleName}</strong></span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className={getStatusBadgeClass(run.status)}>{run.status}</span>
                  <span className={styles.badgeDefault}>
                    {run.candidateCount} {run.candidateCount === 1 ? 'Candidate' : 'Candidates'}
                  </span>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <Link href={`/research/runs/${run.runId}`} className={styles.inspectBtn}>
                  Inspect Results & Evidence &rarr;
                </Link>

                {/* Per-Run Export Toolbar */}
                <ExportToolbar runId={run.runId} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer */}
      {!isLoading && totalPages > 1 && (
        <div className={styles.pagination}>
          <span>
            Page {page} of {totalPages} ({totalCount} total runs)
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

