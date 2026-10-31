import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from '@/app/page';

describe('Home Page (Startup Experience)', () => {
  it('renders the VerityScout AI main title as an h1 heading', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { level: 1, name: /verityscout ai/i });
    expect(heading).toBeInTheDocument();
  });

  it('renders the platform description subtitle', () => {
    render(<Home />);
    const subtitle = screen.getByText(
      /Autonomous Multi-Source Web Research & Deterministic Verification Platform/i
    );
    expect(subtitle).toBeInTheDocument();
  });

  it('renders the foundation status badge with status role', () => {
    render(<Home />);
    const badge = screen.getByText(/Foundation Initialized & Verified/i).closest('[role="status"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent(/Foundation Initialized & Verified/i);
  });

  it('renders the official brand logo with accessible alternative text', () => {
    render(<Home />);
    const logo = screen.getByAltText('VerityScout AI Emblem');
    expect(logo).toBeInTheDocument();
  });

  it('renders the status notice section with an h2 heading', () => {
    render(<Home />);
    const heading2 = screen.getByRole('heading', { level: 2, name: /Current Implementation Status/i });
    expect(heading2).toBeInTheDocument();
  });

  it('clearly discloses that research execution engine and live API calls are not yet active', () => {
    render(<Home />);
    const disclaimer = screen.getByText(
      /No live external searches or API calls are active in this step/i
    );
    expect(disclaimer).toBeInTheDocument();
  });
});
