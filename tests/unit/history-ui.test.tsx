import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResearchHistoryList } from '@/features/history/components/ResearchHistoryList';
import { ExportToolbar } from '@/features/history/components/ExportToolbar';

describe('Research History UI Components (Step 49)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ExportToolbar', () => {
    it('renders single-run export links with JSON, CSV, and Markdown options', () => {
      render(<ExportToolbar runId="test-run-123" />);

      const jsonLink = screen.getByRole('link', { name: /^JSON$/i });
      const csvResultsLink = screen.getByRole('link', { name: /CSV \(Results\)/i });
      const csvEvidenceLink = screen.getByRole('link', { name: /CSV \(Evidence\)/i });
      const mdLink = screen.getByRole('link', { name: /^Markdown$/i });

      expect(jsonLink).toHaveAttribute('href', '/api/research/runs/test-run-123/export?format=json');
      expect(csvResultsLink).toHaveAttribute('href', '/api/research/runs/test-run-123/export?format=csv&dataset=candidates');
      expect(csvEvidenceLink).toHaveAttribute('href', '/api/research/runs/test-run-123/export?format=csv&dataset=evidence');
      expect(mdLink).toHaveAttribute('href', '/api/research/runs/test-run-123/export?format=markdown');
    });

    it('renders history export links when isHistoryExport is true', () => {
      render(
        <ExportToolbar
          isHistoryExport={true}
          queryParams={{ query: 'rtx 4090', status: 'COMPLETED' }}
        />
      );

      const jsonLink = screen.getByRole('link', { name: /^JSON$/i });
      const csvLink = screen.getByRole('link', { name: /^CSV$/i });

      expect(jsonLink).toHaveAttribute('href', '/api/research/history/export?format=json&query=rtx+4090&status=COMPLETED');
      expect(csvLink).toHaveAttribute('href', '/api/research/history/export?format=csv&query=rtx+4090&status=COMPLETED');
    });
  });

  describe('ResearchHistoryList', () => {
    it('fetches and renders runs from API', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          runs: [
            {
              runId: 'run-99',
              taskId: 'task-99',
              taskTitle: 'Dell XPS 15 Search',
              query: 'dell xps 15 oled',
              taskType: 'PRODUCT_RESEARCH',
              status: 'COMPLETED',
              candidateCount: 3,
              startedAt: '2026-11-06T08:00:00.000Z',
              createdAt: '2026-11-06T08:00:00.000Z',
            },
          ],
          pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
        }),
      } as any);

      render(<ResearchHistoryList />);

      await waitFor(() => {
        expect(screen.getByText('Dell XPS 15 Search')).toBeInTheDocument();
      });

      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByText('3 Candidates')).toBeInTheDocument();
    });

    it('submits search filter query and triggers fetch with query params', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          runs: [],
          pagination: { page: 1, limit: 15, total: 0, totalPages: 1 },
        }),
      } as any);

      render(<ResearchHistoryList />);

      const searchInput = screen.getByPlaceholderText(/search query, product, or task title/i);
      fireEvent.change(searchInput, { target: { value: 'lenovo thinkpad' } });
      fireEvent.submit(searchInput.closest('form')!);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('query=lenovo+thinkpad'),
          expect.anything()
        );
      });
    });
  });
});

