import { test, expect } from '@playwright/test';

test.describe('VerityScout AI — Step 15 Route Shells & Fixture Navigation', () => {
  test('NAV-001: Direct navigation to all Step 15 route shells renders expected headings and sample notices', async ({ page }) => {
    const routes = [
      {
        path: '/research',
        expectedHeading: /research workspace/i,
        expectedNotice: /Sample Data & Scaffolding Notice/i,
      },
      {
        path: '/history',
        expectedHeading: /research history/i,
        expectedNotice: /Sample History Preview/i,
      },
      {
        path: '/schedules',
        expectedHeading: /scheduled monitors/i,
        expectedNotice: /Sample Monitoring Preview/i,
      },
      {
        path: '/settings/providers',
        expectedHeading: /provider settings/i,
        expectedNotice: /Configuration Preview — Functionality Deferred/i,
      },
    ];

    for (const route of routes) {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);

      const heading = page.getByRole('heading', { level: 1, name: route.expectedHeading });
      await expect(heading).toBeVisible();

      const notice = page.getByText(route.expectedNotice);
      await expect(notice).toBeVisible();

      // Ensure no horizontal scroll
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll, `Route ${route.path} must not introduce horizontal scroll`).toBe(false);
    }
  });

  test('NAV-002: Dynamic route resolves deterministic fixture demo-run-001', async ({ page }) => {
    const response = await page.goto('/research/runs/demo-run-001');
    expect(response?.status()).toBe(200);

    const heading = page.getByRole('heading', { level: 1, name: /research run detail/i });
    await expect(heading).toBeVisible();

    // Check deterministic fixture data
    await expect(page.getByText(/Deterministic Fixture Record/i)).toBeVisible();
    await expect(page.getByText(/Lenovo ThinkPad T14 Gen 3 \(AMD Ryzen 7 PRO/i)).toBeVisible();
    await expect(page.getByText('$649.99', { exact: true })).toBeVisible();

    // Back link navigates to research workspace
    const backLink = page.getByRole('link', { name: /back to research workspace/i });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page).toHaveURL(/\/research$/);
  });

  test('NAV-003: Dynamic route returns 404 for unknown run identifier', async ({ page }) => {
    const response = await page.goto('/research/runs/unknown-run-999');
    expect(response?.status()).toBe(404);
  });

  test('NAV-004: In-app sidebar navigation updates URL and active state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const sidebar = page.locator('aside[aria-label="Sidebar Navigation"]');

    // Overview should initially be active
    const overviewLink = sidebar.getByRole('link', { name: /overview/i });
    await expect(overviewLink).toHaveAttribute('aria-current', 'page');

    // Click Research Query
    const researchLink = sidebar.getByRole('link', { name: /research query/i });
    await researchLink.click();
    await expect(page).toHaveURL(/\/research$/);
    await expect(researchLink).toHaveAttribute('aria-current', 'page');
    await expect(overviewLink).not.toHaveAttribute('aria-current');

    // Click Run History
    const historyLink = sidebar.getByRole('link', { name: /run history/i });
    await historyLink.click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(historyLink).toHaveAttribute('aria-current', 'page');

    // Click Scheduled Monitors
    const schedulesLink = sidebar.getByRole('link', { name: /scheduled monitors/i });
    await schedulesLink.click();
    await expect(page).toHaveURL(/\/schedules$/);
    await expect(schedulesLink).toHaveAttribute('aria-current', 'page');

    // Click Provider Settings
    const providersLink = sidebar.getByRole('link', { name: /provider settings/i });
    await providersLink.click();
    await expect(page).toHaveURL(/\/settings\/providers$/);
    await expect(providersLink).toHaveAttribute('aria-current', 'page');
  });

  test('NAV-005: Responsive layout integrity across routes at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    const paths = ['/research', '/history', '/schedules', '/settings/providers', '/research/runs/demo-run-001'];
    for (const p of paths) {
      await page.goto(p);
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll, `Path ${p} must fit mobile 375px without horizontal scroll`).toBe(false);
    }
  });
});
