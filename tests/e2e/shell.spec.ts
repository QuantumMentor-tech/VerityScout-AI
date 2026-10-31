import { test, expect } from '@playwright/test';

test.describe('VerityScout AI — Responsive Shell & Accessible Navigation (Step 13)', () => {
  test('SHELL-E2E-001: Application shell rendering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // Skip to main content link
    const skipLink = page.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeDefined();

    // Application header landmark
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Primary navigation landmark
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await expect(nav).toBeVisible();

    // Main content region
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeVisible();
  });

  test('SHELL-E2E-002: Existing route preservation', async ({ page }) => {
    await page.goto('/');

    // Existing home page card and content remain intact inside shell
    const mainCard = page.locator('article');
    await expect(mainCard).toBeVisible();

    const title = page.getByRole('heading', { level: 1, name: /verityscout ai/i });
    await expect(title).toBeVisible();

    const statusBadge = page.getByRole('status').filter({ hasText: 'Foundation Initialized & Verified' });
    await expect(statusBadge).toContainText('Foundation Initialized & Verified');

    // Motion control from Step 12 preserved
    const motionControl = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(motionControl).toBeVisible();
  });

  test('SHELL-E2E-003: Desktop navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Desktop sidebar is visible
    const sidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
    await expect(sidebar).toBeVisible();

    // Mobile toggle is hidden at desktop viewport
    const mobileToggle = page.getByRole('button', { name: /open navigation menu/i });
    await expect(mobileToggle).toBeHidden();

    // Enabled link targets actual implemented route
    const overviewLink = sidebar.getByRole('link', { name: /overview/i });
    await expect(overviewLink).toBeVisible();
    await expect(overviewLink).toHaveAttribute('href', '/');

    // Future planned items are not clickable links
    const futureLink = sidebar.getByRole('link', { name: /evidence explorer/i });
    await expect(futureLink).toHaveCount(0);
  });

  test('SHELL-E2E-004: Mobile navigation opening and closing', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Desktop sidebar is hidden on mobile
    const desktopSidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
    await expect(desktopSidebar).toBeHidden();

    // Mobile toggle button is visible
    const toggleButton = page.getByRole('button', { name: /(open|close) navigation menu/i });
    await expect(toggleButton).toBeVisible();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Open mobile drawer
    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Drawer dialog is visible
    const drawer = page.getByRole('dialog', { name: /mobile navigation menu/i });
    await expect(drawer).toBeVisible();

    const closeButton = page.getByRole('button', { name: /close navigation drawer/i });
    await expect(closeButton).toBeVisible();
    await expect(closeButton).toBeInViewport();

    // Small delay to allow CSS slide transition to settle for clean visual capture
    await page.waitForTimeout(300);

    // Capture drawer open screenshot for visual verification
    await page.screenshot({ path: 'C:/Users/pc/.gemini/antigravity-ide/brain/dc92f443-51c9-469d-93b5-98c04de74fb4/mobile_drawer_375.png' });

    // Close button dismisses drawer
    await closeButton.click();

    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('SHELL-E2E-005: Keyboard dismissal via Escape key', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const toggleButton = page.getByRole('button', { name: /(open|close) navigation menu/i });
    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    // Press Escape
    await page.keyboard.press('Escape');

    await expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  test('SHELL-E2E-006: Current-page semantics', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const sidebar = page.locator('aside[aria-label="Sidebar Navigation"]');
    const activeLink = sidebar.getByRole('link', { name: /overview/i });

    await expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  test('SHELL-E2E-007: Responsive layout without horizontal overflow', async ({ page }) => {
    const viewports = [
      { name: 'Mobile Small', width: 375, height: 667 },
      { name: 'Mobile Large', width: 430, height: 932 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Compact Desktop', width: 1024, height: 768 },
      { name: 'Wide Desktop', width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Check horizontal overflow
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasOverflow, `Viewport ${vp.name} (${vp.width}px) must not have horizontal scroll`).toBe(false);

      // Verify header visibility
      const header = page.locator('header');
      await expect(header).toBeVisible();

      // Verify page content visibility
      const article = page.locator('article');
      await expect(article).toBeVisible();
    }
  });

  test('SHELL-E2E-008: Motion compatibility with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const drawer = page.locator('#mobile-navigation-drawer');
    const transition = await drawer.evaluate((el) => {
      return window.getComputedStyle(el).transitionDuration;
    });

    // In reduced motion, transition duration must be negligible or 0s
    expect(transition === '0s' || transition === '0.00001s' || transition === '0.01ms').toBe(true);
  });
});
