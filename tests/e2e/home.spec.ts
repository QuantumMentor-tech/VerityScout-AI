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

    const badge = page.getByRole('status');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('Foundation Initialized & Verified');

    const noticeHeading = page.getByRole('heading', { level: 2, name: /Current Implementation Status/i });
    await expect(noticeHeading).toBeVisible();

    const disclaimer = page.getByText(/No live external searches or API calls are active in this step/i);
    await expect(disclaimer).toBeVisible();
  });
});
