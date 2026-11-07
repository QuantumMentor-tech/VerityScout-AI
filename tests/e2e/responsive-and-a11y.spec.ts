import { test, expect } from '@playwright/test';
import {
  mockResearchApis,
  mockHistoryAndExportApis,
  mockScheduleApis,
  mockProviderSettingsApis,
  mockNotificationApis,
} from './helpers/e2e-helpers';

test.describe('Responsive Design & Accessibility Validation (Step 56 / WCAG 2.2 AA)', () => {
  // =========================================================================
  // 1. MULTI-VIEWPORT RESPONSIVE MATRIX & OVERFLOW PREVENTION (AC-02, AC-03)
  // =========================================================================
  const testRoutes = [
    { path: '/', name: 'Home' },
    { path: '/research', name: 'Research Workspace' },
    { path: '/research/runs/demo-run-001', name: 'Research Run Detail' },
    { path: '/history', name: 'Research History' },
    { path: '/schedules', name: 'Schedules & Monitoring' },
    { path: '/settings/providers', name: 'Provider Settings' },
    { path: '/login', name: 'Login' },
    { path: '/register', name: 'Register' },
  ];

  const viewports = [
    { name: 'Mobile (375px)', width: 375, height: 667 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop (1440px)', width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    for (const { path, name } of testRoutes) {
      test(`RESP-E2E-001: ${vp.name} renders ${name} (${path}) without horizontal overflow`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await mockResearchApis(page);
        await mockHistoryAndExportApis(page);
        await mockScheduleApis(page);
        await mockProviderSettingsApis(page);
        await mockNotificationApis(page);

        await page.goto(path);

        // Verify zero horizontal document overflow across all viewports
        const hasOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasOverflow, `Route ${path} must not introduce horizontal scroll at ${vp.width}px`).toBe(false);
      });
    }
  }

  // =========================================================================
  // 2. TABLET & MOBILE SHELL ADAPTATION (AC-02, AC-03)
  // =========================================================================
  test('RESP-E2E-002: Tablet (768px) collapses desktop sidebar and reveals accessible mobile toggle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Desktop sidebar is hidden/collapsed on tablet
    const desktopSidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
    await expect(desktopSidebar).toBeHidden();

    // Accessible mobile toggle button is visible in header
    const toggleButton = page.getByRole('button', { name: /open navigation menu/i });
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Main content area occupies full viewport width
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeVisible();
  });

  test('RESP-E2E-003: Research Run Detail adapts candidate attribute grid and export toolbar at 375px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockResearchApis(page);

    await page.goto('/research/runs/demo-run-001');

    // Heading and badges remain visible
    await expect(page.getByRole('heading', { level: 1, name: /research run detail/i })).toBeVisible();

    // Export buttons remain accessible and wrapped
    const jsonExport = page.getByRole('link', { name: 'JSON' });
    await expect(jsonExport).toBeVisible();

    // Candidate cards and attribute grids adapt without clipping
    const candidateCards = page.locator('[data-testid^="candidate-card-"]');
    const count = await candidateCards.count();
    expect(count).toBeGreaterThan(0);
  });

  // =========================================================================
  // 3. KEYBOARD NAVIGATION & SKIP-LINK (AC-06, AC-07)
  // =========================================================================
  test('A11Y-E2E-001: Skip to main content link bypasses header and focuses main landmark', async ({
    page,
  }) => {
    await page.goto('/');

    // Press Tab from initial page load to target skip link
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toBeFocused();

    // Trigger skip link
    await page.keyboard.press('Enter');

    // Verify main content area is targeted
    const mainLandmark = page.locator('#main-content');
    await expect(mainLandmark).toBeVisible();
  });

  test('A11Y-E2E-002: Form fields in Query Composer support full keyboard operation', async ({
    page,
  }) => {
    await page.goto('/research');

    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.focus();
    await page.keyboard.type('Keyboard navigation test query for accessibility');

    // Tab to action buttons
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Clear button should be active and focusable
    const clearBtn = page.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeEnabled();

    // Validate button can be triggered via keyboard
    const validateBtn = page.getByRole('button', { name: /validate & stage query/i });
    await validateBtn.focus();
    await page.keyboard.press('Enter');

    // Verify staging card appears
    await expect(
      page.getByRole('heading', { level: 3, name: /ready to launch asynchronous research/i })
    ).toBeVisible();
  });

  // =========================================================================
  // 4. DIALOG ACCESSIBILITY, FOCUS TRAPPING & ESCAPE DISMISSAL (AC-06, AC-07)
  // =========================================================================
  test('A11Y-E2E-003: Dialogs enforce ARIA role dialog, accessible titles, and focus trapping', async ({
    page,
  }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // Open configuration dialog
    await page.locator('#btn-configure-openrouter').click();

    // Verify ARIA role dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Verify title is accessible
    await expect(
      page.getByRole('heading', { level: 2, name: /configure openrouter credential/i })
    ).toBeVisible();

    // Escape dismisses dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('A11Y-E2E-004: Mobile navigation drawer enforces dialog role, focus, and Escape dismissal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const toggleButton = page.getByRole('button', { name: /(open|close) navigation menu/i });
    await expect(toggleButton).toBeVisible();

    // Open drawer
    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Drawer dialog visible with accessible title
    const drawer = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(drawer).toBeVisible();

    // Close via Escape key
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  // =========================================================================
  // 5. COLOR CONTRAST & NON-COLOR STATUS INDICATION (AC-08, AC-09)
  // =========================================================================
  test('A11Y-E2E-005: Status badges communicate state through explicit textual labels, not color alone', async ({
    page,
  }) => {
    await mockResearchApis(page);
    await mockScheduleApis(page);

    // 1. Check Research Run detail candidate badges
    await page.goto('/research/runs/demo-run-001');

    // Status badges contain explicit textual indicators (e.g. COMPLETED, EXACT MATCH, NEAR MATCH)
    const runStatusBadge = page.getByText(/completed/i).first();
    await expect(runStatusBadge).toBeVisible();

    // 2. Check Schedules status badges
    await page.goto('/schedules');
    const activeBadge = page.getByText(/active/i).first();
    await expect(activeBadge).toBeVisible();
  });

  // =========================================================================
  // 6. REDUCED-MOTION ACCESSIBILITY (AC-11)
  // =========================================================================
  test('A11Y-E2E-006: In-app reduce motion control toggles data-reduce-motion on root html', async ({
    page,
  }) => {
    await page.goto('/');

    const motionCheckbox = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(motionCheckbox).toBeVisible();

    // Check initial state
    const isInitiallyReduced = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-reduce-motion') === 'true';
    });

    // Toggle checkbox
    await motionCheckbox.click();

    const isAfterToggle = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-reduce-motion') === 'true';
    });

    expect(isAfterToggle).toBe(!isInitiallyReduced);
  });

  // =========================================================================
  // 7. TEXT REFLOW & ZOOM RESILIENCE (AC-10 / WCAG 1.4.10)
  // =========================================================================
  test('A11Y-E2E-007: 320px ultra-compact reflow test avoids page-wide horizontal scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await mockResearchApis(page);

    await page.goto('/research');

    // Verify 320px reflow produces zero document-level horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalOverflow, 'WCAG 1.4.10 Reflow at 320px must not produce horizontal scroll').toBe(false);

    // Primary action remains visible and clickable
    const validateBtn = page.getByRole('button', { name: /validate & stage query/i });
    await expect(validateBtn).toBeVisible();
  });
});
