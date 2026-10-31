import { test, expect } from '@playwright/test';

test.describe('VerityScout AI — Startup Experience E2E', () => {
  test('E2E-001: Application startup and main card rendering', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    const mainCard = page.locator('article');
    await expect(mainCard).toBeVisible();
  });

  test('E2E-002: Application identity, branding, and heading verification', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/VerityScout AI/i);

    const heading = page.getByRole('heading', { level: 1, name: /verityscout ai/i });
    await expect(heading).toBeVisible();

    const logo = page.getByAltText('VerityScout AI Emblem');
    await expect(logo).toBeVisible();
  });

  test('E2E-003: Foundation status and research disclaimer visibility', async ({ page }) => {
    await page.goto('/');

    const badge = page.getByRole('status').filter({ hasText: 'Foundation Initialized & Verified' });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Foundation Initialized & Verified');

    const noticeHeading = page.getByRole('heading', { level: 2, name: /Current Implementation Status/i });
    await expect(noticeHeading).toBeVisible();

    const disclaimer = page.getByText(/No live external searches or API calls are active in this step/i);
    await expect(disclaimer).toBeVisible();
  });

  test('E2E-004: Responsive layout and viewport integrity across desktop, tablet, and mobile', async ({ page }) => {
    const viewports = [
      { name: 'Desktop (1440x900)', width: 1440, height: 900 },
      { name: 'Tablet (768x1024)', width: 768, height: 1024 },
      { name: 'Mobile (375x667)', width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      const mainCard = page.locator('article');
      await expect(mainCard).toBeVisible();

      // Ensure no unexpected horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll, `Viewport ${vp.name} must not have horizontal scroll`).toBe(false);

      const heading = page.getByRole('heading', { level: 1, name: /verityscout ai/i });
      await expect(heading).toBeVisible();

      // Capture screenshot for visual baseline verification
      const screenshotFilename = vp.width === 1440 ? 'desktop_1440.png' : vp.width === 768 ? 'tablet_768.png' : 'mobile_375.png';
      await page.screenshot({ path: `C:/Users/pc/.gemini/antigravity-ide/brain/dc92f443-51c9-469d-93b5-98c04de74fb4/${screenshotFilename}` });
    }
  });
});

test.describe('VerityScout AI — Motion Preferences & Animation Control (Step 12)', () => {
  test('MOTION-E2E-001: Default brand treatment initializes and permits animation under normal motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-motion-allowed', 'true');
  });

  test('MOTION-E2E-002: System reduced motion automatically suppresses brand animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-reduce-motion', 'true');
  });

  test('MOTION-E2E-003: In-app reduction stops animation when user toggles Reduce motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(toggle).not.toBeChecked();

    await page.getByText('Reduce motion').click();
    await expect(toggle).toBeChecked();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-reduce-motion', 'true');
    await expect(root).not.toHaveAttribute('data-motion-allowed');
  });

  test('MOTION-E2E-004: In-app preference persists across page reloads', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await page.getByText('Reduce motion').click();
    await expect(toggle).toBeChecked();

    await page.reload();

    const reloadedToggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(reloadedToggle).toBeChecked();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-reduce-motion', 'true');
  });

  test('MOTION-E2E-005: System preference takes precedence over stored app-level preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();

    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-reduce-motion', 'true');
  });

  test('MOTION-E2E-006: Accessible keyboard interaction and focus outline', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const toggle = page.getByRole('checkbox', { name: /reduce motion/i });
    await toggle.focus();
    await expect(toggle).toBeFocused();

    // Toggle via keyboard Space key
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();

    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
  });
});
