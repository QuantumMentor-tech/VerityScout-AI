import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ResearchPage from '@/app/research/page';
import RunDetailPage from '@/app/research/runs/[runId]/page';
import HistoryPage from '@/app/history/page';
import SchedulesPage from '@/app/schedules/page';
import ProviderSettingsPage from '@/app/settings/providers/page';

// Mock next/navigation for notFound
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

describe('Step 15 Page Shells', () => {
  it('renders Research Workspace page shell with disclosure notice', () => {
    render(<ResearchPage />);

    expect(screen.getByRole('heading', { level: 1, name: /research workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/Query Composer Reserved Region/i)).toBeInTheDocument();
    expect(screen.getByText(/Sample Data & Scaffolding Notice/i)).toBeInTheDocument();
  });

  it('renders Research Run Detail page shell for valid demo-run-001', async () => {
    const pageElement = await RunDetailPage({
      params: Promise.resolve({ runId: 'demo-run-001' }),
    });

    render(pageElement);

    expect(screen.getByRole('heading', { level: 1, name: /research run detail/i })).toBeInTheDocument();
    expect(screen.getByText(/Deterministic Fixture Record/i)).toBeInTheDocument();
    expect(screen.getByText(/Lenovo ThinkPad T14 Gen 3 \(AMD Ryzen 7 PRO/i)).toBeInTheDocument();
    expect(screen.getByText('$649.99')).toBeInTheDocument();
  });

  it('calls notFound for unknown runId', async () => {
    await expect(
      RunDetailPage({
        params: Promise.resolve({ runId: 'non-existent-run' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('renders History page shell with sample history records', () => {
    render(<HistoryPage />);

    expect(screen.getByRole('heading', { level: 1, name: /research history/i })).toBeInTheDocument();
    expect(screen.getByText(/Sample History Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/LG C3 65" OLED TV/i)).toBeInTheDocument();
  });

  it('renders Schedules page shell with monitoring records', () => {
    render(<SchedulesPage />);

    expect(screen.getByRole('heading', { level: 1, name: /scheduled monitors/i })).toBeInTheDocument();
    expect(screen.getByText(/Sample Monitoring Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/ThinkPad T14 Price & Stock Watch/i)).toBeInTheDocument();
  });

  it('renders Provider Settings page shell with deferred configuration notice', () => {
    render(<ProviderSettingsPage />);

    expect(screen.getByRole('heading', { level: 1, name: /provider settings/i })).toBeInTheDocument();
    expect(screen.getByText(/Configuration Preview — Functionality Deferred/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI \(Reasoning & Structured Outputs\)/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenRouter \(Multi-Model Routing\)/i)).toBeInTheDocument();
    expect(screen.getByText(/NVIDIA NIM \(Microservices Inference\)/i)).toBeInTheDocument();
  });
});
