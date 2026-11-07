'use client';

import React, { useState, useCallback, useMemo } from 'react';
import styles from './CandidateEvidenceView.module.css';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, Badge, Button } from '@/components/ui';
import type { SampleResearchCandidate } from '@/fixtures/types';
import type { SourceDocument, EvidenceRecord } from '../types';
import { EvidenceDrawer } from './EvidenceDrawer';
import { SourceExplorer } from './SourceExplorer';

export interface CandidateEvidenceViewProps {
  readonly candidates: readonly SampleResearchCandidate[];
  readonly sources: readonly SourceDocument[];
  readonly evidenceRecords: readonly EvidenceRecord[];
}

export function CandidateEvidenceView({
  candidates,
  sources,
  evidenceRecords,
}: CandidateEvidenceViewProps): React.JSX.Element {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceRecord | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceDocument | null>(null);
  const [selectedCandidateName, setSelectedCandidateName] = useState<string | undefined>(undefined);

  const handleOpenEvidence = useCallback(
    (evidence: EvidenceRecord, source?: SourceDocument, candidateName?: string) => {
      // Find source if not explicitly provided
      const resolvedSource = source ?? sources.find((s) => s.id === evidence.sourceId) ?? null;

      setSelectedEvidence(evidence);
      setSelectedSource(resolvedSource);
      setSelectedCandidateName(candidateName);
      setIsDrawerOpen(true);
    },
    [sources]
  );

  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedEvidence(null);
    setSelectedSource(null);
    setSelectedCandidateName(undefined);
  }, []);

  // Performance Optimization (Step 57):
  // Pre-index evidence records by candidateId and claimKey to replace O(C * A * E) filter/find
  // operations in render loops with O(1) constant-time Map lookups.
  const evidenceIndex = useMemo(() => {
    const byCandidate = new Map<string, EvidenceRecord[]>();
    const byCandidateAndKey = new Map<string, Map<string, EvidenceRecord>>();

    for (const ev of evidenceRecords) {
      if (!ev.candidateId) continue;

      // Group by candidateId
      let candList = byCandidate.get(ev.candidateId);
      if (!candList) {
        candList = [];
        byCandidate.set(ev.candidateId, candList);
      }
      candList.push(ev);

      // Group by candidateId + claimKey
      if (ev.claimKey) {
        let keyMap = byCandidateAndKey.get(ev.candidateId);
        if (!keyMap) {
          keyMap = new Map();
          byCandidateAndKey.set(ev.candidateId, keyMap);
        }
        if (!keyMap.has(ev.claimKey)) {
          keyMap.set(ev.claimKey, ev);
        }
      }
    }

    return { byCandidate, byCandidateAndKey };
  }, [evidenceRecords]);

  return (
    <div className={styles.container}>
      <section>
        <h2
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--space-4)',
            color: 'var(--color-text-primary)',
          }}
        >
          Verified Candidate Results ({candidates.length})
        </h2>

        <div className={styles.candidatesList} data-testid="candidates-list">
          {candidates.map((cand) => {
            const candEvidence = evidenceIndex.byCandidate.get(cand.id) ?? [];
            const candKeyMap = evidenceIndex.byCandidateAndKey.get(cand.id);

            return (
              <Card key={cand.id} variant="default" data-testid={`candidate-card-${cand.id}`}>
                <CardHeader>
                  <div className={styles.candidateHeader}>
                    <div className={styles.candidateTitleArea}>
                      <CardTitle as="h3">{cand.name}</CardTitle>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Retailer: {cand.retailer}
                      </span>
                    </div>

                    <div className={styles.priceTierArea}>
                      <span className={styles.price}>{cand.price}</span>
                      <Badge variant={cand.tier === 'Strong Match' ? 'success' : 'warning'} size="sm">
                        {cand.tier}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className={styles.attributeGrid}>
                    {cand.verifiedAttributes.map((attr, idx) => {
                      const matchedEvidence = candKeyMap?.get(attr.key);

                      return (
                        <div key={idx} className={styles.attributeItem} data-testid={`attribute-item-${idx}`}>
                          <div className={styles.attrTop}>
                            <span className={styles.attributeKey}>{attr.key}</span>
                            {matchedEvidence && (
                              <Button
                                variant="outline"
                                size="sm"
                                className={styles.evidenceTriggerBtn}
                                onClick={() => handleOpenEvidence(matchedEvidence, undefined, cand.name)}
                                aria-label={`View evidence excerpt for ${attr.key}`}
                              >
                                View Evidence
                              </Button>
                            )}
                          </div>

                          <div className={styles.attributeValue}>
                            <span>
                              {attr.value} {attr.matchesConstraint ? '✓' : '✗'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>

                <CardFooter>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      {candEvidence.length} verified evidence {candEvidence.length === 1 ? 'citation' : 'citations'}
                    </span>

                    {candEvidence.length > 0 && candEvidence[0] && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEvidence(candEvidence[0]!, undefined, cand.name)}
                        aria-label={`Inspect evidence records for ${cand.name}`}
                      >
                        Inspect Evidence ({candEvidence.length})
                      </Button>
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <SourceExplorer
          sources={sources}
          evidenceRecords={evidenceRecords}
          onInspectEvidence={(ev, src) => handleOpenEvidence(ev, src)}
        />
      </section>

      <EvidenceDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        evidence={selectedEvidence}
        source={selectedSource}
        candidateName={selectedCandidateName}
      />
    </div>
  );
}
