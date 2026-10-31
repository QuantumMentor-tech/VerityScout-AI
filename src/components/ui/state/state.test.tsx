import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { EmptyState } from './EmptyState';
import { SafeErrorState } from './SafeErrorState';

describe('State Primitives', () => {
  describe('LoadingSpinner', () => {
    it('renders role="status" and accessible label', () => {
      render(<LoadingSpinner label="Fetching sources..." />);

      const spinner = screen.getByRole('status');
      expect(spinner).toBeInTheDocument();
      expect(screen.getByText('Fetching sources...')).toBeInTheDocument();
    });
  });

  describe('EmptyState', () => {
    it('renders title, description, and action slot', () => {
      render(
        <EmptyState
          title="No Sources Extracted"
          description="Initiate a research query to discover source documents."
          action={<button type="button">New Query</button>}
        />
      );

      expect(screen.getByRole('heading', { level: 3, name: 'No Sources Extracted' })).toBeInTheDocument();
      expect(screen.getByText(/Initiate a research query/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'New Query' })).toBeInTheDocument();
    });
  });

  describe('SafeErrorState', () => {
    it('renders role="alert" with safe message and executes retry callback', () => {
      const handleRetry = vi.fn();
      render(
        <SafeErrorState
          title="Search Provider Timeout"
          message="The discovery provider did not respond within the allocated time limit."
          onRetry={handleRetry}
          retryLabel="Retry Discovery"
        />
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Search Provider Timeout' })).toBeInTheDocument();
      expect(screen.getByText(/did not respond within the allocated time limit/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: 'Retry Discovery' });
      fireEvent.click(retryBtn);
      expect(handleRetry).toHaveBeenCalledTimes(1);
    });
  });
});
