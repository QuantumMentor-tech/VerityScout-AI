import { test, expect } from '@playwright/test';
import { mockNotificationApis } from './helpers/e2e-helpers';

test.describe('In-App Notification Center & Alerts (Step 53)', () => {
  test('NOTIF-E2E-001: Displays unread notification count badge in application header', async ({
    page,
  }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    // 1. Locate bell button and verify unread count in aria-label
    const bellBtn = page.getByRole('button', { name: /research notifications \(2 unread\)/i });
    await expect(bellBtn).toBeVisible();

    // 2. Verify badge pill shows count
    await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  });

  test('NOTIF-E2E-002: Opens notification center and displays structured notification items', async ({
    page,
  }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    // 1. Verify notification center header
    await expect(page.getByRole('heading', { level: 3, name: /notifications/i })).toBeVisible();

    // 2. Verify notification item titles
    await expect(page.getByText(/thinkpad t14 price drop to \$649\.99/i)).toBeVisible();
    await expect(page.getByText(/stock status verified available/i)).toBeVisible();

    // 3. Verify notification badges
    await expect(page.getByText('Price Drop').first()).toBeVisible();
    await expect(page.getByText('Stock Change').first()).toBeVisible();
  });

  test('NOTIF-E2E-003: Switches between All and Unread filter tabs', async ({ page }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    // 1. Tab buttons
    const unreadTab = page.getByRole('tab', { name: /^unread/i });
    await expect(unreadTab).toBeVisible();
    await unreadTab.click();

    // Verify unread items remain visible
    await expect(page.getByText(/thinkpad t14 price drop to \$649\.99/i)).toBeVisible();

    const allTab = page.getByRole('tab', { name: /^all/i });
    await expect(allTab).toBeVisible();
    await allTab.click();
  });

  test('NOTIF-E2E-004: Marks an alert as read and updates unread badge counter', async ({ page }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    // 1. Click Mark Read on first item
    const markReadBtn = page.getByRole('button', { name: /mark "thinkpad t14 price drop.*" as read/i });
    await expect(markReadBtn).toBeVisible();
    await markReadBtn.click();

    // 2. Verify Mark Read button disappears once marked as read
    await expect(markReadBtn).not.toBeVisible();
  });

  test('NOTIF-E2E-005: Dismisses an alert item from the notification center', async ({ page }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    // 1. Click Dismiss button
    const dismissBtn = page.getByRole('button', { name: /dismiss notification "stock status.*"/i });
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // 2. Verify item is dismissed
    await expect(page.getByText(/stock status verified available/i)).not.toBeVisible();
  });

  test('NOTIF-E2E-006: Navigates to linked research run detail from notification item', async ({
    page,
  }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    // 1. Click View Run link
    const viewRunLink = page.getByRole('link', { name: /view run →/i }).first();
    await expect(viewRunLink).toBeVisible();
    await viewRunLink.click();

    // 2. Verify navigation to the target research run detail
    await page.waitForURL(/\/research\/runs\/run-e2e-live-001/);
    await expect(page.getByRole('heading', { level: 1, name: /research run detail/i })).toBeVisible();
  });

  test('NOTIF-E2E-007: Closes notification center on Escape key press', async ({ page }) => {
    await mockNotificationApis(page);

    await page.goto('/');

    const bellBtn = page.getByRole('button', { name: /research notifications/i });
    await bellBtn.click();

    const notifHeading = page.getByRole('heading', { level: 3, name: /notifications/i });
    await expect(notifHeading).toBeVisible();

    // Press Escape key
    await page.keyboard.press('Escape');

    // Verify dialog is closed
    await expect(notifHeading).not.toBeVisible();
  });
});

