'use client';

import React from 'react';
import styles from './SourceExplorer.module.css';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, EmptyState } from '@/components/ui';
import type { SourceDocument, EvidenceRecord } from '../types';
import { SourceAccessState } from '../types';
import { validateSourceUrl } from '../url-validator';

export interface SourceExplorerProps {
  readonly sources: readonly SourceDocument[];
  readonly evidenceRecords?: readonly EvidenceRecord[];
  readonly onInspectEvidence?: (evidence: EvidenceRecord, source: SourceDocument) => void;
  readonly title?: string;
  readonly className?: string;
}

export function SourceExplorer({
  sources,
  evidenceRecords = [],
  onInspectEvidence,
  title = 'Discovered Research Sources',
  className = '',
}: SourceExplorerProps): React.JSX.Element {
  if (sources.length === 0) {
    return (
      <Card variant="default" className={className}>
        <CardContent>
          <EmptyState
            title="No Sources Supplied"
            description="No web source documents or citations were associated with this research context."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="default" className={[styles.container, className].filter(Boolean).join(' ')}>
      <CardHeader>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <CardTitle as="h2" className={styles.title}>
              {title}
            </CardTitle>
            <Badge variant="brand" size="sm">
              {sources.length} {sources.length === 1 ? 'Source' : 'Sources'}
            </Badge>
          </div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            Step 20 Traceability • Untrusted External Content Safe Rendering
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className={styles.sourceGrid} data-testid="source-grid">
          {sources.map((src) => {
            const validatedUrl = validateSourceUrl(src.canonicalUrl);
            const associatedEvidence = evidenceRecords.filter((ev) => ev.sourceId === src.id);
            const hasEvidence = associatedEvidence.length > 0;

            const isAccessible = src.accessState === SourceAccessState.ACCESSIBLE;

            return (
              <div key={src.id} className={styles.sourceCard} data-testid={`source-card-${src.id}`}>
                <div className={styles.cardTop}>
                  <div className={styles.badgeRow}>
                    <Badge variant="neutral" size="sm">
                      {src.domain || 'Unknown Domain'}
                    </Badge>
                    <Badge variant={isAccessible ? 'success' : 'warning'} size="sm">
                      {src.accessState}
                    </Badge>
                    <Badge variant="brand" size="sm">
                      {src.discoveryProvider}
                    </Badge>
                  </div>

                  <h3 className={styles.sourceTitle}>{src.title}</h3>

                  <div>
                    {validatedUrl.isValid && validatedUrl.safeUrl ? (
                      <a
                        href={validatedUrl.safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.sourceLink}
                        aria-label={`Visit original source: ${src.title} (opens in new tab)`}
                      >
                        {validatedUrl.safeUrl} &rarr;
                      </a>
                    ) : (
                      <span className={styles.untrustedLink} role="status">
                        Link unavailable ({validatedUrl.error ?? 'Untrusted Protocol'})
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.metaGrid}>
                  <div>
                    <strong>Retrieved:</strong> {src.retrievedAt}
                  </div>
                  <div>
                    <strong>HTTP Status:</strong> {src.httpStatusCode ?? 'N/A'}
                  </div>
                  {src.publishedAt && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <strong>Published:</strong> {src.publishedAt}
                    </div>
                  )}
                </div>

                <div className={styles.cardFooter}>
                  <span className={styles.evidenceCountText}>
                    {hasEvidence
                      ? `${associatedEvidence.length} associated ${associatedEvidence.length === 1 ? 'evidence item' : 'evidence items'}`
                      : 'No evidence items linked'}
                  </span>

                  {hasEvidence && onInspectEvidence && associatedEvidence[0] ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectEvidence(associatedEvidence[0]!, src)}
                      aria-label={`Inspect evidence for ${src.title}`}
                    >
                      Inspect Evidence ({associatedEvidence.length})
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled>
                      No Evidence
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
