import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SourceExplorer } from './components/SourceExplorer';
import { SourceAccessState, ExtractionState, VerificationState } from './types';
import type { SourceDocument, EvidenceRecord } from './types';

describe('SourceExplorer Component (Step 20)', () => {
  const sampleValidSource: SourceDocument = {
    id: 'src-valid-001',
    runId: 'run-test-001',
    originalUrl: 'https://example.com/products/specifications',
    canonicalUrl: 'https://example.com/products/specifications',
    title: 'Acme Official Specifications',
    domain: 'example.com',
    discoveryProvider: 'brave_search',
    retrievedAt: '2026-11-01T10:00:00Z',
    publishedAt: '2026-10-15T08:00:00Z',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
    httpStatusCode: 200,
  };

  const sampleEvidence: EvidenceRecord = {
    id: 'ev-001',
    sourceId: 'src-valid-001',
    candidateId: 'cand-001',
    claimKey: 'Weight',
    extractedRawValue: '2.4 kg',
    verbatimQuote: 'Total curb weight is measured at precisely 2.4 kg.',
    extractionMethod: 'DOM_SELECTOR',
    verificationState: VerificationState.SUPPORTED,
    confidenceScore: 0.98,
    capturedAt: '2026-11-01T10:00:00Z',
  };

  // SOURCE-UNIT-001: Valid source metadata
  it('SOURCE-UNIT-001: renders source with valid supplied metadata correctly', () => {
    render(<SourceExplorer sources={[sampleValidSource]} evidenceRecords={[sampleEvidence]} />);

    expect(screen.getByText('Acme Official Specifications')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText('brave_search')).toBeInTheDocument();
    expect(screen.getByText('ACCESSIBLE')).toBeInTheDocument();
    expect(screen.getByText(/2026-11-01T10:00:00Z/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-15T08:00:00Z/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP Status:/)).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  // SOURCE-UNIT-002: Valid external URL
  it('SOURCE-UNIT-002: renders supported URL as safe external link with noopener noreferrer', () => {
    render(<SourceExplorer sources={[sampleValidSource]} />);

    const link = screen.getByRole('link', {
      name: /Visit original source: Acme Official Specifications/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://example.com/products/specifications');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  // SOURCE-UNIT-003: Invalid URL
  it('SOURCE-UNIT-003: does not render invalid or unsupported URL as a clickable link', () => {
    const untrustedSource: SourceDocument = {
      ...sampleValidSource,
      id: 'src-malicious-001',
      canonicalUrl: 'javascript:alert(document.cookie)',
      title: 'Malicious Injected Source',
    };

    render(<SourceExplorer sources={[untrustedSource]} />);

    // Link must NOT be rendered
    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(0);

    // Untrusted status must be displayed
    const statusMsg = screen.getByRole('status');
    expect(statusMsg).toHaveTextContent(/Link unavailable/i);
    expect(statusMsg).toHaveTextContent(/Unsupported or prohibited protocol/i);
  });

  // SOURCE-UNIT-004: Missing metadata
  it('SOURCE-UNIT-004: handles missing optional fields truthfully without inventing titles or dates', () => {
    const minimalSource: SourceDocument = {
      id: 'src-minimal-001',
      runId: 'run-test-001',
      originalUrl: 'https://example.com/minimal',
      canonicalUrl: 'https://example.com/minimal',
      title: 'Minimal Source',
      domain: 'example.com',
      discoveryProvider: 'custom_search',
      retrievedAt: '2026-11-01T10:00:00Z',
      accessState: SourceAccessState.ACCESSIBLE,
      extractionState: ExtractionState.SKIPPED,
    };

    render(<SourceExplorer sources={[minimalSource]} />);

    expect(screen.getByText('Minimal Source')).toBeInTheDocument();
    // Published date was not provided and should not be displayed
    expect(screen.queryByText(/Published:/)).not.toBeInTheDocument();
    // HTTP Status was not provided and should render N/A
    expect(screen.getByText(/HTTP Status:/)).toBeInTheDocument();
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  // SOURCE-UNIT-005: Source counts
  it('SOURCE-UNIT-005: derives source count from the actual collection length', () => {
    const source2: SourceDocument = {
      ...sampleValidSource,
      id: 'src-002',
      canonicalUrl: 'https://second.example.com',
      title: 'Second Source',
    };

    const { rerender } = render(<SourceExplorer sources={[sampleValidSource]} />);
    expect(screen.getByText('1 Source')).toBeInTheDocument();

    rerender(<SourceExplorer sources={[sampleValidSource, source2]} />);
    expect(screen.getByText('2 Sources')).toBeInTheDocument();
  });

  // SOURCE-UNIT-006: Empty source list
  it('SOURCE-UNIT-006: renders clear empty state when no source records are supplied', () => {
    render(<SourceExplorer sources={[]} />);

    expect(screen.getByText('No Sources Supplied')).toBeInTheDocument();
    expect(
      screen.getByText(/No web source documents or citations were associated with this research context/i)
    ).toBeInTheDocument();
  });

  // SOURCE-UNIT-007: No live fetching
  it('SOURCE-UNIT-007: does not issue network requests or fetch calls when rendering sources', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<SourceExplorer sources={[sampleValidSource]} />);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // Interaction: triggers onInspectEvidence when clicked
  it('triggers onInspectEvidence callback with matching evidence and source when action button is clicked', () => {
    const handleInspect = vi.fn();
    render(
      <SourceExplorer
        sources={[sampleValidSource]}
        evidenceRecords={[sampleEvidence]}
        onInspectEvidence={handleInspect}
      />
    );

    const inspectBtn = screen.getByRole('button', {
      name: /Inspect evidence for Acme Official Specifications/i,
    });
    expect(inspectBtn).toBeInTheDocument();

    fireEvent.click(inspectBtn);
    expect(handleInspect).toHaveBeenCalledTimes(1);
    expect(handleInspect).toHaveBeenCalledWith(sampleEvidence, sampleValidSource);
  });
});
