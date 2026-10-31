import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AppShell } from './AppShell';

// Mock next/navigation
const mockPathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('AppShell Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/');
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders application shell landmarks: skip link, header, navigation, and content area', () => {
    render(
      <AppShell>
        <div data-testid="test-content">Workspace Content</div>
      </AppShell>
    );

    // Skip link
    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');

    // Content container
    const content = screen.getByTestId('test-content');
    expect(content).toBeInTheDocument();

    // Nav landmark
    const nav = screen.getAllByRole('navigation', { name: /main navigation/i });
    expect(nav.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the brand identity with link to home', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    const brandLink = screen.getByRole('link', { name: /verityscout ai home/i });
    expect(brandLink).toBeInTheDocument();
    expect(brandLink).toHaveAttribute('href', '/');
  });

  it('identifies the active implemented route with aria-current="page"', () => {
    mockPathname.mockReturnValue('/');

    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    // In desktop sidebar, Overview link is active
    const overviewLinks = screen.getAllByRole('link', { name: /overview/i });
    expect(overviewLinks.length).toBeGreaterThanOrEqual(1);
    expect(overviewLinks[0]).toHaveAttribute('aria-current', 'page');
    expect(overviewLinks[0]).toHaveAttribute('href', '/');
  });

  it('renders unimplemented future destinations as non-links with badge', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    // Evidence Explorer is not yet implemented (Step 23)
    expect(screen.queryByRole('link', { name: /evidence explorer/i })).not.toBeInTheDocument();

    // But its text label and badge are rendered with aria-disabled="true"
    const evidenceItems = screen.getAllByText('Evidence Explorer');
    expect(evidenceItems.length).toBeGreaterThanOrEqual(1);

    const stepBadges = screen.getAllByText('Step 23');
    expect(stepBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('manages mobile drawer open and close state via header toggle button', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click toggle to open
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Close button inside drawer is now visible
    const closeButton = screen.getByRole('button', { name: /close navigation drawer/i });
    expect(closeButton).toBeInTheDocument();

    // Click close button inside drawer
    fireEvent.click(closeButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('dismisses the mobile navigation drawer when Escape key is pressed', async () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('dismisses mobile drawer when clicking the backdrop', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    const backdrop = screen.getByTestId('mobile-nav-backdrop');
    fireEvent.click(backdrop);

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('locks and restores document body scroll during mobile drawer lifecycle', () => {
    render(
      <AppShell>
        <div>Content</div>
      </AppShell>
    );

    expect(document.body.style.overflow).toBe('');

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(toggleButton);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(toggleButton);
    expect(document.body.style.overflow).toBe('');
  });
});
