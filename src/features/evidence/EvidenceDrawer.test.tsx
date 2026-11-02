import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { CandidateEvidenceView } from './components/CandidateEvidenceView';
import { SourceAccessState, ExtractionState, VerificationState } from './types';
import type { SourceDocument, EvidenceRecord } from './types';
import type { SampleResearchCandidate } from '@/fixtures/types';

describe('Evidence Drawer & Candidate Traceability (Step 20)', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  const sampleSourceA: SourceDocument = {
    id: 'src-alpha',
    runId: 'run-001',
    originalUrl: 'https://docs.alpha.com/spec',
    canonicalUrl: 'https://docs.alpha.com/spec',
    title: 'Alpha Technical Manual',
    domain: 'docs.alpha.com',
    discoveryProvider: 'tavily',
    retrievedAt: '2026-11-01T09:00:00Z',
    publishedAt: '2026-09-01T00:00:00Z',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
    httpStatusCode: 200,
  };

  const sampleSourceB: SourceDocument = {
    id: 'src-beta',
    runId: 'run-001',
    originalUrl: 'https://specs.beta.org/overview',
    canonicalUrl: 'https://specs.beta.org/overview',
    title: 'Beta Certification Authority',
    domain: 'specs.beta.org',
    discoveryProvider: 'brave_search',
    retrievedAt: '2026-11-01T09:15:00Z',
    accessState: SourceAccessState.ACCESSIBLE,
    extractionState: ExtractionState.SUCCESS,
  };

  const sampleEvidenceAlpha: EvidenceRecord = {
    id: 'ev-alpha-001',
    sourceId: 'src-alpha',
    candidateId: 'cand-001',
    claimKey: 'Noise Level',
    extractedRawValue: '34 dB',
    verbatimQuote: 'Acoustic testing verified an operating noise level of exactly 34 dB at maximum throughput.',
    locationInDocument: 'Section 4.2, Table 3',
    extractionMethod: 'DOM_SELECTOR',
    verificationState: VerificationState.SUPPORTED,
    confidenceScore: 0.99,
    capturedAt: '2026-11-01T09:05:00Z',
  };

  const sampleCandidates: SampleResearchCandidate[] = [
    {
      id: 'cand-001',
      name: 'Alpha Pro 2000',
      price: '$299',
      retailer: 'TechStore',
      url: 'https://techstore.example.com/alpha-pro-2000',
      tier: 'Strong Match',
      verifiedAttributes: [
        { key: 'Noise Level', value: '34 dB', matchesConstraint: true },
        { key: 'Power Consumption', value: '45W', matchesConstraint: true },
      ],
    },
    {
      id: 'cand-002',
      name: 'Beta Max 500',
      price: '$349',
      retailer: 'ElectroHub',
      url: 'https://electrohub.example.com/beta-max-500',
      tier: 'Near Match',
      verifiedAttributes: [
        { key: 'Noise Level', value: '42 dB', matchesConstraint: false },
      ],
    },
  ];

  /* -------------------------------------------------------------------------
   * EVIDENCE RELATIONSHIP TESTS (EVIDENCE-UNIT-001 through 007)
   * ----------------------------------------------------------------------- */

  // EVIDENCE-UNIT-001: Valid source association
  it('EVIDENCE-UNIT-001: resolves evidence record to exact source identified by its sourceId', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={sampleEvidenceAlpha}
        source={sampleSourceA}
        candidateName="Alpha Pro 2000"
      />
    );

    expect(screen.getByText('Alpha Technical Manual')).toBeInTheDocument();
    expect(screen.getByText('docs.alpha.com')).toBeInTheDocument();
    expect(screen.getByText(/Section 4.2, Table 3/)).toBeInTheDocument();
  });

  // EVIDENCE-UNIT-002: Invalid association
  it('EVIDENCE-UNIT-002: does not silently fall back to an unrelated source when source is missing', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={sampleEvidenceAlpha}
        source={null} // Source missing / not found
        candidateName="Alpha Pro 2000"
      />
    );

    expect(screen.getByText('Source Metadata Missing')).toBeInTheDocument();
    expect(screen.getByText(/was not supplied or has been omitted/i)).toBeInTheDocument();
    expect(screen.queryByText('Beta Certification Authority')).not.toBeInTheDocument();
  });

  // EVIDENCE-UNIT-003: Candidate association
  it('EVIDENCE-UNIT-003: preserves candidate association and does not mix with another candidate', () => {
    render(
      <CandidateEvidenceView
        candidates={sampleCandidates}
        sources={[sampleSourceA, sampleSourceB]}
        evidenceRecords={[sampleEvidenceAlpha]}
      />
    );

    // Alpha card should show 1 verified evidence citation
    const alphaCard = screen.getByTestId('candidate-card-cand-001');
    expect(alphaCard).toHaveTextContent('1 verified evidence citation');

    // Beta card should show 0 citations and no Inspect Evidence button
    const betaCard = screen.getByTestId('candidate-card-cand-002');
    expect(betaCard).toHaveTextContent('0 verified evidence citations');
    expect(betaCard.querySelector('button[aria-label*="Beta Max 500"]')).toBeNull();
  });

  // EVIDENCE-UNIT-004: Attribute association
  it('EVIDENCE-UNIT-004: associates evidence strictly with specific attribute, not unrelated attributes', () => {
    render(
      <CandidateEvidenceView
        candidates={sampleCandidates}
        sources={[sampleSourceA]}
        evidenceRecords={[sampleEvidenceAlpha]}
      />
    );

    // Alpha Pro has Noise Level and Power Consumption
    // "View Evidence" button must exist only for Noise Level
    const noiseLevelTrigger = screen.getByRole('button', {
      name: 'View evidence excerpt for Noise Level',
    });
    expect(noiseLevelTrigger).toBeInTheDocument();

    const powerConsumptionTrigger = screen.queryByRole('button', {
      name: 'View evidence excerpt for Power Consumption',
    });
    expect(powerConsumptionTrigger).not.toBeInTheDocument();
  });

  // EVIDENCE-UNIT-005: Empty excerpt
  it('EVIDENCE-UNIT-005: truthfully communicates when verbatim excerpt is not supplied', () => {
    const evidenceWithoutExcerpt: EvidenceRecord = {
      ...sampleEvidenceAlpha,
      id: 'ev-no-quote',
      verbatimQuote: undefined,
    };

    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={evidenceWithoutExcerpt}
        source={sampleSourceA}
      />
    );

    expect(screen.getByText('Excerpt Not Supplied')).toBeInTheDocument();
    expect(
      screen.getByText(/contains no extracted verbatim quote excerpt/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('verbatim-quote-box')).not.toBeInTheDocument();
  });

  // EVIDENCE-UNIT-006: Exact excerpt
  it('EVIDENCE-UNIT-006: renders supplied verbatim text accurately without rewriting or paraphrasing', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={sampleEvidenceAlpha}
        source={sampleSourceA}
      />
    );

    const quoteBox = screen.getByTestId('verbatim-quote-box');
    expect(quoteBox).toHaveTextContent(
      'Acoustic testing verified an operating noise level of exactly 34 dB at maximum throughput.'
    );
  });

  // EVIDENCE-UNIT-007: No fabricated verification
  it('EVIDENCE-UNIT-007: does not fabricate verified status for an unknown verification state', () => {
    const unverifiedEvidence: EvidenceRecord = {
      ...sampleEvidenceAlpha,
      id: 'ev-unverified',
      verificationState: VerificationState.UNKNOWN,
    };

    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={unverifiedEvidence}
        source={sampleSourceA}
      />
    );

    expect(screen.getByText('Unverified / Unknown')).toBeInTheDocument();
    expect(screen.queryByText('Supported by Evidence')).not.toBeInTheDocument();
  });

  /* -------------------------------------------------------------------------
   * EVIDENCE DRAWER TESTS (DRAWER-UNIT-001 through 007)
   * ----------------------------------------------------------------------- */

  // DRAWER-UNIT-001: Open correct record
  it('DRAWER-UNIT-001: opens drawer displaying the specific selected evidence record', () => {
    render(
      <CandidateEvidenceView
        candidates={sampleCandidates}
        sources={[sampleSourceA]}
        evidenceRecords={[sampleEvidenceAlpha]}
      />
    );

    // Click "View Evidence" on Noise Level
    const viewBtn = screen.getByRole('button', {
      name: 'View evidence excerpt for Noise Level',
    });
    fireEvent.click(viewBtn);

    const dialog = screen.getByRole('dialog', { name: 'Evidence Record & Provenance' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('ID: ev-alpha-001')).toBeInTheDocument();
    expect(within(dialog).getByText('Alpha Pro 2000')).toBeInTheDocument();
  });

  // DRAWER-UNIT-002: Close behavior
  it('DRAWER-UNIT-002: closes drawer when Close Drawer button or dialog close button is activated', () => {
    const handleClose = vi.fn();
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={handleClose}
        evidence={sampleEvidenceAlpha}
        source={sampleSourceA}
      />
    );

    const closeBtn = screen.getByRole('button', { name: 'Close Drawer' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const dialogCloseBtn = screen.getByRole('button', { name: 'Close dialog' });
    fireEvent.click(dialogCloseBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  // DRAWER-UNIT-003: Focus behavior
  it('DRAWER-UNIT-003: renders accessible dialog with proper ARIA attributes', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={sampleEvidenceAlpha}
        source={sampleSourceA}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Evidence Record & Provenance' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  // DRAWER-UNIT-004: Source context
  it('DRAWER-UNIT-004: displays evidence with full source context and extraction metadata', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={sampleEvidenceAlpha}
        source={sampleSourceA}
      />
    );

    expect(screen.getByText('Alpha Technical Manual')).toBeInTheDocument();
    expect(screen.getByText('DOM_SELECTOR')).toBeInTheDocument();
    expect(screen.getByText('Noise Level:')).toBeInTheDocument();
    expect(screen.getByText('34 dB')).toBeInTheDocument();
  });

  // DRAWER-UNIT-005: Invalid record state
  it('DRAWER-UNIT-005: safely renders informative alert when evidence record is null', () => {
    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={null}
        source={null}
      />
    );

    expect(screen.getByText('Evidence Record Unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('verbatim-quote-box')).not.toBeInTheDocument();
  });

  // DRAWER-UNIT-006: Safe text rendering
  it('DRAWER-UNIT-006: renders markup-like source text safely as plain text without executing HTML', () => {
    const maliciousEvidence: EvidenceRecord = {
      ...sampleEvidenceAlpha,
      id: 'ev-malicious',
      verbatimQuote: '<script>alert("XSS")</script><img src="x" onerror="steal()" />',
      claimKey: '<b onmouseover="pwn()">Dangerous Claim</b>',
      extractedRawValue: '<iframe src="evil.com"></iframe>',
    };

    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={vi.fn()}
        evidence={maliciousEvidence}
        source={sampleSourceA}
      />
    );

    // Verify it is in document as inert text and no script tags were executed
    const quoteBox = screen.getByTestId('verbatim-quote-box');
    expect(quoteBox).toHaveTextContent('<script>alert("XSS")</script><img src="x" onerror="steal()" />');
    expect(document.querySelector('script[src="evil.com"]')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  // DRAWER-UNIT-007: State reset
  it('DRAWER-UNIT-007: resets evidence detail state when closed, avoiding stale records on reopening', () => {
    const { rerender } = render(
      <CandidateEvidenceView
        candidates={sampleCandidates}
        sources={[sampleSourceA, sampleSourceB]}
        evidenceRecords={[sampleEvidenceAlpha]}
      />
    );

    // Open drawer for Alpha
    const viewBtn = screen.getByRole('button', {
      name: 'View evidence excerpt for Noise Level',
    });
    fireEvent.click(viewBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('ID: ev-alpha-001')).toBeInTheDocument();

    // Close drawer
    const closeBtn = screen.getByRole('button', { name: 'Close Drawer' });
    fireEvent.click(closeBtn);

    // Rerender with a second evidence record
    const sampleEvidenceBeta: EvidenceRecord = {
      id: 'ev-beta-002',
      sourceId: 'src-beta',
      candidateId: 'cand-002',
      claimKey: 'Noise Level',
      extractedRawValue: '42 dB',
      verbatimQuote: 'Measured noise output is 42 dB.',
      extractionMethod: 'DOM_SELECTOR',
      verificationState: VerificationState.CONTRADICTED,
      confidenceScore: 0.95,
      capturedAt: '2026-11-01T09:20:00Z',
    };

    rerender(
      <CandidateEvidenceView
        candidates={sampleCandidates}
        sources={[sampleSourceA, sampleSourceB]}
        evidenceRecords={[sampleEvidenceAlpha, sampleEvidenceBeta]}
      />
    );

    // Beta now has Inspect Evidence button
    const betaInspectBtn = screen.getByRole('button', {
      name: 'Inspect evidence records for Beta Max 500',
    });
    fireEvent.click(betaInspectBtn);

    // Must show ev-beta-002 and Beta Max 500, NOT stale ev-alpha-001
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('ID: ev-beta-002')).toBeInTheDocument();
    expect(within(dialog).getByText('Beta Max 500')).toBeInTheDocument();
    expect(screen.queryByText('ID: ev-alpha-001')).not.toBeInTheDocument();
  });
});
