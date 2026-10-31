import { test, expect } from '@playwright/test';

test.describe('VerityScout AI — Query Composer E2E (Step 16)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/research');
  });

  test('COMPOSER-E2E-001: Renders Query Composer form with accessible label and character counter', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 2, name: /research query composer/i });
    await expect(heading).toBeVisible();

    const textarea = page.getByLabel(/research question or topic/i);
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('');

    const charCounter = page.getByText(/0 \/ 1,000 characters/i);
    await expect(charCounter).toBeVisible();

    const validateBtn = page.getByRole('button', { name: /validate & stage query/i });
    await expect(validateBtn).toBeVisible();

    const clearBtn = page.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toBeDisabled();
  });

  test('COMPOSER-E2E-002: Rejects empty or whitespace submission with inline validation error', async ({ page }) => {
    const validateBtn = page.getByRole('button', { name: /validate & stage query/i });
    await validateBtn.click();

    const errorAlert = page.getByRole('alert').filter({ hasText: 'Enter a research question to continue.' });
    await expect(errorAlert).toBeVisible();

    // Now test whitespace only
    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.fill('    \n   ');
    await validateBtn.click();

    await expect(errorAlert).toBeVisible();
  });

  test('COMPOSER-E2E-003: Selecting an example prompt populates textarea without auto-submitting', async ({ page }) => {
    const exampleBtn = page.getByRole('button', { name: /Load example query: ThinkPad T14 Gen 3/i });
    await expect(exampleBtn).toBeVisible();
    await exampleBtn.click();

    const textarea = page.getByLabel(/research question or topic/i);
    await expect(textarea).toHaveValue('Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700');

    // Verify it did not auto-submit
    const successNotice = page.getByText(/Query Passes Local Validation/i);
    await expect(successNotice).not.toBeVisible();

    // Verify character count updated
    await expect(page.getByText(/59 \/ 1,000 characters/i)).toBeVisible();

    // Clear button is now enabled
    const clearBtn = page.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeEnabled();
  });

  test('COMPOSER-E2E-004: Validates valid query and displays truthful local validation notice', async ({ page }) => {
    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.fill('Sony WH-1000XM5 headphones under $300 in new condition');

    const validateBtn = page.getByRole('button', { name: /validate & stage query/i });
    await validateBtn.click();

    // Success notice appears
    const successAlert = page.getByText(/Query Passes Local Validation/i);
    await expect(successAlert).toBeVisible();

    // Truthful disclosure is present
    const disclosure = page.getByText(/Live execution \(Step 18\+ telemetry & Step 43 worker pipeline\) is currently disconnected; no live API requests were made/i);
    await expect(disclosure).toBeVisible();
  });

  test('COMPOSER-E2E-005: Clear action resets query and restores initial state', async ({ page }) => {
    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.fill('Temporary draft query to clear');

    const clearBtn = page.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeEnabled();
    await clearBtn.click();

    await expect(textarea).toHaveValue('');
    await expect(clearBtn).toBeDisabled();
    await expect(page.getByText(/0 \/ 1,000 characters/i)).toBeVisible();
  });

  test('COMPOSER-E2E-006: Keyboard shortcut Ctrl+Enter validates query while Enter creates newline', async ({ page }) => {
    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.focus();
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');

    await expect(textarea).toHaveValue('Line 1\nLine 2');

    // Trigger Ctrl+Enter
    await page.keyboard.press('Control+Enter');

    const successAlert = page.getByText(/Query Passes Local Validation/i);
    await expect(successAlert).toBeVisible();
  });

  test('COMPOSER-E2E-007: Mobile 375px responsive layout has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/research');

    const textarea = page.getByLabel(/research question or topic/i);
    await expect(textarea).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
