import { test, expect } from '@playwright/test';

test.describe('VerityScout AI — Source Explorer & Evidence Drawer E2E (Step 20)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/research/runs/demo-run-001');
  });

  test('EVIDENCE-E2E-001: Renders Research Run Detail with candidates and source explorer', async ({ page }) => {
    // Heading and fixture disclosure alert
    const heading = page.getByRole('heading', { level: 1, name: /research run detail/i });
    await expect(heading).toBeVisible();

    const fixtureAlert = page.getByText(/Deterministic Fixture Record/i);
    await expect(fixtureAlert).toBeVisible();

    // Candidates section
    const candidatesHeading = page.getByRole('heading', { level: 2, name: /verified candidate results/i });
    await expect(candidatesHeading).toBeVisible();

    // Discovered sources section
    const sourcesHeading = page.getByRole('heading', { level: 2, name: /discovered research sources/i });
    await expect(sourcesHeading).toBeVisible();
  });

  test('EVIDENCE-E2E-002: Opens Evidence Drawer from candidate attribute trigger', async ({ page }) => {
    // Find "View Evidence" button for the first candidate's Memory (RAM) attribute
    const candidateCard = page.getByTestId('candidate-card-cand-001');
    const viewEvidenceBtn = candidateCard.getByRole('button', { name: /view evidence excerpt for memory \(ram\)/i });
    await expect(viewEvidenceBtn).toBeVisible();
    await viewEvidenceBtn.click();

    // Verify Evidence Drawer dialog opens
    const dialog = page.getByRole('dialog', { name: /evidence record & provenance/i });
    await expect(dialog).toBeVisible();

    // Verify claim details inside drawer
    await expect(dialog.getByText(/Target Claim \/ Specification/i)).toBeVisible();
    await expect(dialog.getByText(/Memory \(RAM\):/i)).toBeVisible();
    await expect(dialog.getByText('32GB LPDDR5-6400', { exact: true })).toBeVisible();

    // Verify verbatim quote box
    const quoteBox = page.getByTestId('verbatim-quote-box');
    await expect(quoteBox).toBeVisible();
    await expect(quoteBox).toContainText('Installed Memory: 32GB LPDDR5-6400MHz soldered.');

    // Verify source document metadata
    await expect(dialog.getByText(/eBay Refurbished/i)).toBeVisible();
    await expect(dialog.getByText(/ebay.com/i)).toBeVisible();

    // Verify safe external link attributes
    const sourceLink = dialog.getByRole('link', { name: /visit original source/i });
    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toHaveAttribute('target', '_blank');
    await expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Close drawer via Close Drawer button
    const closeBtn = dialog.getByRole('button', { name: /close drawer/i });
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test('EVIDENCE-E2E-003: Opens Evidence Drawer from candidate card footer and dismisses via Escape', async ({ page }) => {
    const inspectBtn = page.getByRole('button', { name: /inspect evidence records for lenovo thinkpad/i }).first();
    await expect(inspectBtn).toBeVisible();
    await inspectBtn.click();

    const dialog = page.getByRole('dialog', { name: /evidence record & provenance/i });
    await expect(dialog).toBeVisible();

    // Press Escape key to close
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('EVIDENCE-E2E-004: Source Explorer renders safe URLs and handles untrusted protocols safely', async ({ page }) => {
    // Check source grid presence
    const sourceGrid = page.getByTestId('source-grid');
    await expect(sourceGrid).toBeVisible();

    // Valid source card (src-001) has working link
    const validCard = page.getByTestId('source-card-src-001');
    await expect(validCard).toBeVisible();
    const validLink = validCard.getByRole('link', { name: /visit original source/i });
    await expect(validLink).toBeVisible();
    await expect(validLink).toHaveAttribute('href', 'https://example.com/listings/thinkpad-t14-gen3-32gb');
    await expect(validLink).toHaveAttribute('target', '_blank');
    await expect(validLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Untrusted source card (src-004 with javascript:void(0)) must NOT have a clickable link
    const untrustedCard = page.getByTestId('source-card-src-004');
    await expect(untrustedCard).toBeVisible();
    const untrustedLinks = untrustedCard.getByRole('link');
    await expect(untrustedLinks).toHaveCount(0);

    // Untrusted badge/message must be displayed
    const untrustedStatus = untrustedCard.getByRole('status');
    await expect(untrustedStatus).toBeVisible();
    await expect(untrustedStatus).toContainText('Link unavailable');
    await expect(untrustedStatus).toContainText('Unsupported or prohibited protocol');
  });

  test('EVIDENCE-E2E-005: Inspect Evidence from Source Explorer card opens correct evidence record', async ({ page }) => {
    const inspectBtn = page.getByRole('button', { name: /inspect evidence for lenovo psref/i });
    await expect(inspectBtn).toBeVisible();
    await inspectBtn.click();

    const dialog = page.getByRole('dialog', { name: /evidence record & provenance/i });
    await expect(dialog).toBeVisible();

    // Verify source title in drawer
    await expect(dialog.getByText('Lenovo PSREF — ThinkPad T14 Gen 3 (AMD) Product Specifications Reference')).toBeVisible();
    await expect(dialog.getByText('lenovo.com')).toBeVisible();

    // Verify quote
    const quoteBox = page.getByTestId('verbatim-quote-box');
    await expect(quoteBox).toContainText('ThinkPad T14 Gen 3 (AMD): Memory: Up to 32GB soldered memory');
  });

  test('EVIDENCE-E2E-006: Responsive mobile viewport rendering without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const candidateCard = page.getByTestId('candidate-card-cand-001');
    const viewEvidenceBtn = candidateCard.getByRole('button', { name: /view evidence excerpt for memory \(ram\)/i });
    await viewEvidenceBtn.click();

    const dialog = page.getByRole('dialog', { name: /evidence record & provenance/i });
    await expect(dialog).toBeVisible();

    // Verify dialog width fits within viewport
    const boundingBox = await dialog.boundingBox();
    expect(boundingBox).not.toBeNull();
    if (boundingBox) {
      expect(boundingBox.width).toBeLessThanOrEqual(375);
    }

    // Verify horizontal scrollbar does not overflow window
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px margin for subpixel rounding
  });
});
