'use client';

import React from 'react';
import styles from './EvidenceDrawer.module.css';
import { Dialog, Badge, Alert, Button } from '@/components/ui';
import type { EvidenceRecord, SourceDocument } from '../types';
import { VerificationState } from '../types';
import { validateSourceUrl } from '../url-validator';

export interface EvidenceDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly evidence?: EvidenceRecord | null | undefined;
  readonly source?: SourceDocument | null | undefined;
  readonly candidateName?: string | undefined;
  readonly triggerRef?: React.RefObject<HTMLElement | null> | undefined;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  evidence,
  source,
  candidateName,
  triggerRef,
}: EvidenceDrawerProps): React.JSX.Element {
  const getVerificationBadge = (state: VerificationState) => {
    switch (state) {
      case VerificationState.SUPPORTED:
        return <Badge variant="success">Supported by Evidence</Badge>;
      case VerificationState.CONTRADICTED:
        return <Badge variant="danger">Contradicted by Source</Badge>;
      case VerificationState.CONFLICTING:
        return <Badge variant="warning">Conflicting Sources</Badge>;
      case VerificationState.STALE:
        return <Badge variant="warning">Stale Record (&gt;24h)</Badge>;
      case VerificationState.UNKNOWN:
      default:
        return <Badge variant="neutral">Unverified / Unknown</Badge>;
    }
  };

  const validatedUrl = source?.canonicalUrl ? validateSourceUrl(source.canonicalUrl) : null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Evidence Record & Provenance"
      description="Inspect verifiable source citations, direct text quotes, and attribute extraction metadata."
      size="lg"
      triggerRef={triggerRef}
      id="evidence-drawer"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close Drawer
          </Button>
        </div>
      }
    >
      <div className={styles.drawerContent}>
        {!evidence ? (
          <Alert variant="info" title="Evidence Record Unavailable">
            No specific evidence record was selected or the requested record is not available.
          </Alert>
        ) : (
          <>
            <div className={styles.badgesRow}>
              {getVerificationBadge(evidence.verificationState)}
              <Badge variant="brand">{evidence.extractionMethod}</Badge>
              <Badge variant="neutral">ID: {evidence.id}</Badge>
            </div>

            <div className={styles.claimCard}>
              <span className={styles.claimLabel}>Target Claim / Specification</span>
              <div className={styles.claimValue}>
                {evidence.claimKey}: <strong>{evidence.extractedRawValue}</strong>
              </div>
              {candidateName && (
                <div className={styles.candidateAssociation}>
                  Candidate: <strong>{candidateName}</strong>
                </div>
              )}
            </div>

            {evidence.conflictDetails && (
              <div className={styles.conflictAlert}>
                <Alert variant="warning" title="Constraint / Source Conflict">
                  {evidence.conflictDetails}
                </Alert>
              </div>
            )}

            <div className={styles.quoteSection}>
              <span className={styles.sectionHeading}>Verbatim Source Excerpt</span>
              {evidence.verbatimQuote ? (
                <div className={styles.quoteBox} data-testid="verbatim-quote-box">
                  &ldquo;{evidence.verbatimQuote}&rdquo;
                </div>
              ) : (
                <Alert variant="warning" title="Excerpt Not Supplied">
                  This evidence record exists but contains no extracted verbatim quote excerpt.
                </Alert>
              )}
              {evidence.locationInDocument && (
                <span className={styles.locationTag}>
                  Location in document: {evidence.locationInDocument}
                </span>
              )}
            </div>

            <div className={styles.sourceSection}>
              <span className={styles.sectionHeading}>Source Document Metadata</span>
              {source ? (
                <>
                  <div className={styles.sourceTitle}>{source.title}</div>
                  <div className={styles.sourceMetaGrid}>
                    <div><strong>Domain:</strong> {source.domain}</div>
                    <div><strong>Provider:</strong> {source.discoveryProvider}</div>
                    <div><strong>Access State:</strong> {source.accessState}</div>
                    <div><strong>Retrieved At:</strong> {source.retrievedAt}</div>
                    {source.publishedAt && (
                      <div><strong>Published At:</strong> {source.publishedAt}</div>
                    )}
                  </div>

                  <div>
                    {validatedUrl?.isValid && validatedUrl.safeUrl ? (
                      <a
                        href={validatedUrl.safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.sourceLink}
                        aria-label={`Visit original source: ${source.title} (opens in new tab)`}
                      >
                        Visit original source &rarr;
                      </a>
                    ) : (
                      <span className={styles.untrustedLinkNotice} role="status">
                        Source URL link unavailable ({validatedUrl?.error ?? 'Invalid URL'})
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <Alert variant="warning" title="Source Metadata Missing">
                  Source metadata corresponding to source ID <code>{evidence.sourceId}</code> was not supplied or has been omitted.
                </Alert>
              )}
            </div>

            <Alert variant="info" title="Provenance & Traceability Notice">
              Illustrative synthetic evidence record for interface evaluation. Live multi-source web scrapers,
              headless extraction, and automated cross-source claim verification are scheduled for Phase 7 (Step 23+).
            </Alert>
          </>
        )}
      </div>
    </Dialog>
  );
}
