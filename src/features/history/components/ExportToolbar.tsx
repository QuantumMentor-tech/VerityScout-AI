'use client';

import React from 'react';
import styles from './ExportToolbar.module.css';

export interface ExportToolbarProps {
  readonly runId?: string | undefined;
  readonly queryParams?: Record<string, string | undefined> | undefined;
  readonly isHistoryExport?: boolean | undefined;
}

export const ExportToolbar: React.FC<ExportToolbarProps> = ({
  runId,
  queryParams,
  isHistoryExport = false,
}) => {
  const getDownloadUrl = (format: string, dataset?: string): string => {
    if (isHistoryExport) {
      const params = new URLSearchParams();
      params.set('format', format);
      if (queryParams) {
        for (const [key, val] of Object.entries(queryParams)) {
          if (val) params.set(key, val);
        }
      }
      return `/api/research/history/export?${params.toString()}`;
    }

    if (!runId) return '#';
    const params = new URLSearchParams();
    params.set('format', format);
    if (dataset) params.set('dataset', dataset);
    return `/api/research/runs/${runId}/export?${params.toString()}`;
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Export Options">
      <span className={styles.label}>Export:</span>
      <div className={styles.buttonGroup}>
        <a
          href={getDownloadUrl('json')}
          download
          className={styles.exportBtn}
          title="Download versioned JSON export"
        >
          JSON
        </a>
        {!isHistoryExport ? (
          <>
            <a
              href={getDownloadUrl('csv', 'candidates')}
              download
              className={styles.exportBtn}
              title="Download Candidates CSV"
            >
              CSV (Results)
            </a>
            <a
              href={getDownloadUrl('csv', 'evidence')}
              download
              className={styles.exportBtn}
              title="Download Evidence CSV"
            >
              CSV (Evidence)
            </a>
          </>
        ) : (
          <a
            href={getDownloadUrl('csv')}
            download
            className={styles.exportBtn}
            title="Download History CSV"
          >
            CSV
          </a>
        )}
        <a
          href={getDownloadUrl('markdown')}
          download
          className={styles.exportBtn}
          title="Download Markdown Report"
        >
          Markdown
        </a>
      </div>
    </div>
  );
};

