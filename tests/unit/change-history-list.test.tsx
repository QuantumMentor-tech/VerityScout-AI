import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangeHistoryList } from '@/features/changes/components/ChangeHistoryList';
import { ChangeItem, ChangeSummaryMetrics } from '@/features/changes/types';

describe('ChangeHistoryList Component', () => {
  const mockSummary: ChangeSummaryMetrics = {
    totalCompared: 10,
    changedCount: 3,
    unchangedCount: 5,
    newlyObservedCount: 1,
    noLongerObservedCount: 1,
    conflictingCount: 0,
    notComparableCount: 0,
  };

  const mockChanges: ChangeItem[] = [
    {
      id: 'change-1',
      candidateTitle: 'MacBook Pro 14 M3',
      canonicalUrl: 'https://apple.com/macbook-pro',
      fieldName: 'price',
      changeType: 'PRICE_DROP',
      previousValue: '1599.00 USD',
      newValue: '1399.00 USD',
      percentageDelta: -12.51,
      reasonCode: 'PRICE_DROP_CONFIRMED',
      explanation: 'Price decreased by 12.51% from 1599.00 USD to 1399.00 USD.',
      evidenceId: 'ev-curr-1',
      baselineEvidenceId: 'ev-base-1',
    },
    {
      id: 'change-2',
      candidateTitle: 'MacBook Pro 14 M3',
      fieldName: 'availability',
      changeType: 'STOCK_STATUS_CHANGE',
      previousValue: 'IN_STOCK',
      newValue: 'OUT_OF_STOCK',
      reasonCode: 'STOCK_STATUS_CHANGED',
      explanation: 'Availability changed from IN_STOCK to OUT_OF_STOCK.',
    },
    {
      id: 'change-3',
      candidateTitle: 'Sony WH-1000XM5',
      fieldName: 'candidate',
      changeType: 'NEW_OFFER_DISCOVERED',
      previousValue: 'NOT_OBSERVED',
      newValue: 'Sony WH-1000XM5',
      reasonCode: 'ATTRIBUTE_FIRST_OBSERVED',
      explanation: 'New offer Sony WH-1000XM5 discovered in current run.',
    },
  ];

  it('renders summary bar with metrics', () => {
    render(<ChangeHistoryList changes={mockChanges} summary={mockSummary} />);

    expect(screen.getByText('Total Compared')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders change cards with diffs, reason codes, and delta badges', () => {
    render(<ChangeHistoryList changes={mockChanges} summary={mockSummary} />);

    expect(screen.getAllByText('MacBook Pro 14 M3').length).toBeGreaterThan(0);
    expect(screen.getByText('1599.00 USD')).toBeInTheDocument();
    expect(screen.getByText('1399.00 USD')).toBeInTheDocument();
    expect(screen.getByText('-12.5%')).toBeInTheDocument();
    expect(screen.getByText('PRICE_DROP_CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('Price Drop')).toBeInTheDocument();
  });

  it('filters changes when filter buttons are clicked', () => {
    render(<ChangeHistoryList changes={mockChanges} summary={mockSummary} />);

    // Click 'Prices' filter
    const pricesFilter = screen.getByRole('button', { name: /^Prices$/i });
    fireEvent.click(pricesFilter);

    expect(screen.getByText('Price Drop')).toBeInTheDocument();
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument();
    expect(screen.queryByText('New Offer')).not.toBeInTheDocument();
  });

  it('fires onSelectEvidence when evidence button is clicked', () => {
    const onSelectEvidence = vi.fn();
    render(
      <ChangeHistoryList
        changes={mockChanges}
        summary={mockSummary}
        onSelectEvidence={onSelectEvidence}
      />
    );

    const baselineEvButton = screen.getByRole('button', { name: /Baseline Evidence/i });
    fireEvent.click(baselineEvButton);
    expect(onSelectEvidence).toHaveBeenCalledWith('ev-base-1');

    const currentEvButton = screen.getByRole('button', { name: /Current Evidence/i });
    fireEvent.click(currentEvButton);
    expect(onSelectEvidence).toHaveBeenCalledWith('ev-curr-1');
  });

  it('renders empty state when there are no changes', () => {
    render(<ChangeHistoryList changes={[]} summary={mockSummary} />);

    expect(screen.getByText('No Changes Detected')).toBeInTheDocument();
    expect(
      screen.getByText(/Research observations are consistent with the established baseline/i)
    ).toBeInTheDocument();
  });
});

