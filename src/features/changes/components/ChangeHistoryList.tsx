'use client';

import React, { useState, useMemo } from 'react';
import styles from './ChangeHistoryList.module.css';
import { ChangeItem, ChangeSummaryMetrics } from '../types';

export interface ChangeHistoryListProps {
  readonly changes: readonly ChangeItem[];
  readonly summary?: ChangeSummaryMetrics | undefined;
  readonly isLoading?: boolean | undefined;
  readonly onSelectEvidence?: ((evidenceId: string) => void) | undefined;
  readonly onRefresh?: (() => void) | undefined;
}

type FilterCategory = 'ALL' | 'PRICE' | 'AVAILABILITY' | 'SPECS' | 'OFFERS';

export const ChangeHistoryList: React.FC<ChangeHistoryListProps> = ({
  changes,
  summary,
  isLoading = false,
  onSelectEvidence,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<FilterCategory>('ALL');

  const filteredChanges = useMemo(() => {
    if (filter === 'ALL') return changes;
    if (filter === 'PRICE') {
      return changes.filter(
        (c) =>
          c.changeType === 'PRICE_DROP' ||
          c.changeType === 'PRICE_INCREASE' ||
          c.fieldName === 'price'
      );
    }
    if (filter === 'AVAILABILITY') {
      return changes.filter(
        (c) =>
          c.changeType === 'STOCK_STATUS_CHANGE' ||
          c.fieldName === 'availability'
      );
    }
    if (filter === 'SPECS') {
      return changes.filter(
        (c) =>
          c.changeType === 'SPECIFICATION_UPDATE' ||
          c.fieldName.startsWith('spec:')
      );
    }
    if (filter === 'OFFERS') {
      return changes.filter(
        (c) =>
          c.changeType === 'NEW_OFFER_DISCOVERED' ||
          c.changeType === 'NEWLY_OBSERVED' ||
          c.changeType === 'NO_LONGER_OBSERVED' ||
          c.fieldName === 'candidate'
      );
    }
    return changes;
  }, [changes, filter]);

  const getBadgeClass = (changeType: string): string => {
    switch (changeType) {
      case 'PRICE_DROP':
        return styles.badgePriceDrop ?? '';
      case 'PRICE_INCREASE':
        return styles.badgePriceIncrease ?? '';
      case 'STOCK_STATUS_CHANGE':
        return styles.badgeStockChange ?? '';
      case 'SPECIFICATION_UPDATE':
        return styles.badgeSpecUpdate ?? '';
      case 'NEW_OFFER_DISCOVERED':
      case 'NEWLY_OBSERVED':
        return styles.badgeNewOffer ?? '';
      case 'NO_LONGER_OBSERVED':
        return styles.badgeNoLongerObserved ?? '';
      default:
        return styles.badgeGeneric ?? '';
    }
  };

  const formatChangeType = (changeType: string): string => {
    switch (changeType) {
      case 'PRICE_DROP':
        return 'Price Drop';
      case 'PRICE_INCREASE':
        return 'Price Increase';
      case 'STOCK_STATUS_CHANGE':
        return 'Stock Status';
      case 'SPECIFICATION_UPDATE':
        return 'Spec Update';
      case 'NEW_OFFER_DISCOVERED':
      case 'NEWLY_OBSERVED':
        return 'New Offer';
      case 'NO_LONGER_OBSERVED':
        return 'No Longer Observed';
      case 'UNCHANGED':
        return 'Unchanged';
      default:
        return changeType.replace(/_/g, ' ');
    }
  };

  return (
    <div className={styles.container}>
      {/* Summary Metrics Bar */}
      {summary && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryMetric}>
            <span className={styles.metricValue}>{summary.totalCompared}</span>
            <span className={styles.metricLabel}>Total Compared</span>
          </div>
          <div className={`${styles.summaryMetric} ${styles.priceDrop}`}>
            <span className={styles.metricValue}>{summary.changedCount}</span>
            <span className={styles.metricLabel}>Changed</span>
          </div>
          <div className={`${styles.summaryMetric} ${styles.newOffer}`}>
            <span className={styles.metricValue}>{summary.newlyObservedCount}</span>
            <span className={styles.metricLabel}>Newly Observed</span>
          </div>
          <div className={styles.summaryMetric}>
            <span className={styles.metricValue}>{summary.noLongerObservedCount}</span>
            <span className={styles.metricLabel}>Unobserved</span>
          </div>
          {summary.notComparableCount > 0 && (
            <div className={styles.summaryMetric}>
              <span className={styles.metricValue}>{summary.notComparableCount}</span>
              <span className={styles.metricLabel}>Incomparable</span>
            </div>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div className={styles.filterBar}>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'ALL' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('ALL')}
        >
          All Changes ({changes.length})
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'PRICE' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('PRICE')}
        >
          Prices
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'AVAILABILITY' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('AVAILABILITY')}
        >
          Availability
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'SPECS' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('SPECS')}
        >
          Specifications
        </button>
        <button
          type="button"
          className={`${styles.filterButton} ${filter === 'OFFERS' ? styles.filterButtonActive : ''}`}
          onClick={() => setFilter('OFFERS')}
        >
          Offers
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className={styles.emptyState}>
          <p>Analyzing observation history and detecting changes...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredChanges.length === 0 && (
        <div className={styles.emptyState}>
          <h3>No Changes Detected</h3>
          <p>
            Research observations are consistent with the established baseline. No material
            attribute changes, new offers, or price movements were observed.
          </p>
          {onRefresh && (
            <button
              type="button"
              className={styles.filterButton}
              style={{ marginTop: '0.75rem' }}
              onClick={onRefresh}
            >
              Re-evaluate Baseline
            </button>
          )}
        </div>
      )}

      {/* Changes List */}
      {!isLoading && filteredChanges.length > 0 && (
        <div className={styles.list}>
          {filteredChanges.map((change, index) => {
            const badgeClass = getBadgeClass(change.changeType);
            const key = change.id ?? `change-${index}`;

            return (
              <div key={key} className={styles.card}>
                <div className={styles.cardHeader}>
                  {change.canonicalUrl ? (
                    <a
                      href={change.canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.candidateTitle}
                    >
                      {change.candidateTitle}
                    </a>
                  ) : (
                    <span className={styles.candidateTitle}>{change.candidateTitle}</span>
                  )}
                  <span className={`${styles.badge} ${badgeClass}`}>
                    {formatChangeType(change.changeType)}
                  </span>
                </div>

                <div className={styles.diffRow}>
                  <span className={styles.fieldName}>{change.fieldName}</span>
                  <span className={styles.valueBefore}>{change.previousValue}</span>
                  <span className={styles.arrow}>&rarr;</span>
                  <span className={styles.valueAfter}>{change.newValue}</span>

                  {change.percentageDelta != null && (
                    <span
                      className={`${styles.deltaBadge} ${
                        change.percentageDelta < 0 ? styles.deltaNegative : styles.deltaPositive
                      }`}
                    >
                      {change.percentageDelta > 0 ? '+' : ''}
                      {change.percentageDelta.toFixed(1)}%
                    </span>
                  )}
                </div>

                {change.explanation && (
                  <p className={styles.explanation}>{change.explanation}</p>
                )}

                <div className={styles.cardFooter}>
                  {change.reasonCode && (
                    <span className={styles.reasonCode}>{change.reasonCode}</span>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    {change.baselineEvidenceId && onSelectEvidence && (
                      <button
                        type="button"
                        className={styles.evidenceLink}
                        onClick={() => onSelectEvidence(change.baselineEvidenceId!)}
                      >
                        Baseline Evidence
                      </button>
                    )}
                    {change.evidenceId && onSelectEvidence && (
                      <button
                        type="button"
                        className={styles.evidenceLink}
                        onClick={() => onSelectEvidence(change.evidenceId!)}
                      >
                        Current Evidence
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

