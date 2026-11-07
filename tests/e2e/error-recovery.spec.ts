import { test, expect } from '@playwright/test';

test.describe('Error Handling, Negative Journeys & Fault Recovery (Step 53)', () => {
  test('ERR-E2E-001: Handles 401 Unauthorized on provider settings gracefully', async ({ page }) => {
    // Intercept providers API to return 401 Unauthorized
    await page.route('/api/settings/providers', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Authentication required' }),
      });
    });

    await page.goto('/settings/providers');

    // Verify error banner is visible and prompts sign in
    const alert = page.getByRole('alert').filter({ hasText: /please sign in/i });
    await expect(alert).toBeVisible();
  });

  test('ERR-E2E-002: Handles 404 Not Found for non-existent research run', async ({ page }) => {
    // Navigate to non-existent run ID
    const response = await page.goto('/research/runs/non-existent-run-xyz');
    expect(response?.status()).toBe(404);

    // Verify 404 / Not Found message
    await expect(
      page.getByText(/404|not found|this page could not be found/i).first()
    ).toBeVisible();
  });

  test('ERR-E2E-003: Retains user form inputs when schedule creation API fails', async ({ page }) => {
    // Intercept schedule creation to fail with 500
    await page.route(/\/api\/schedules$/, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database transaction error writing schedule occurrence' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schedules: [] }),
      });
    });

    await page.goto('/schedules');

    // Open schedule creation form
    await page.getByRole('button', { name: /\+ create recurring schedule/i }).click();

    const queryInput = page.getByLabel(/research query \*/i);
    await queryInput.fill('RTX 5090 Price Tracker with Specific Recovery Test');

    const nameInput = page.getByLabel(/schedule name \(optional\)/i);
    await nameInput.fill('Recovery Test Name');

    // Click submit
    await page.getByRole('button', { name: /save & activate schedule/i }).click();

    // Verify error alert is displayed
    const alert = page.getByRole('alert').filter({ hasText: /database transaction error/i });
    await expect(alert).toBeVisible();

    // Verify user input was NOT discarded
    await expect(queryInput).toHaveValue('RTX 5090 Price Tracker with Specific Recovery Test');
    await expect(nameInput).toHaveValue('Recovery Test Name');
  });

  test('ERR-E2E-004: Handles history API failure with actionable error presentation', async ({
    page,
  }) => {
    // Intercept history API to return 500
    await page.route(/\/api\/research\/history/, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Connection pool exhausted while querying runs' }),
      });
    });

    await page.goto('/history');

    // Verify error state is shown in history list
    await expect(
      page.getByText(/connection pool exhausted while querying runs/i)
    ).toBeVisible();

    // Verify the page structure remains intact
    await expect(page.getByRole('heading', { level: 1, name: /research history/i })).toBeVisible();
  });
});
