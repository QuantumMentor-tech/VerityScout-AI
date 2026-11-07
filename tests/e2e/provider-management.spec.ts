import { test, expect } from '@playwright/test';
import { mockProviderSettingsApis } from './helpers/e2e-helpers';

test.describe('AI Provider Settings & Credential Safety (Step 53)', () => {
  test('PROV-E2E-001: Renders provider cards with configured and unconfigured states', async ({
    page,
  }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // 1. Verify heading
    await expect(page.getByRole('heading', { level: 1, name: /provider settings/i })).toBeVisible();

    // 2. Verify OpenAI is configured
    await expect(page.getByRole('heading', { level: 2, name: 'OpenAI' })).toBeVisible();
    await expect(page.getByText('sk-proj-****8492')).toBeVisible();

    // 3. Verify OpenRouter is unconfigured
    await expect(page.getByRole('heading', { level: 2, name: 'OpenRouter' })).toBeVisible();
    const openrouterBtn = page.locator('#btn-configure-openrouter');
    await expect(openrouterBtn).toHaveText('Configure Key');
  });

  test('PROV-E2E-002: Saves new API credential, displays AES-256-GCM alert, and masks secret', async ({
    page,
  }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // 1. Open OpenRouter configuration dialog
    await page.locator('#btn-configure-openrouter').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/protected by hardware-accelerated aes-256-gcm/i)).toBeVisible();

    // 2. Type secret API key (type="password")
    const keyInput = dialog.locator('input[type="password"]');
    await expect(keyInput).toBeVisible();
    await keyInput.fill('sk-or-v1-secret-test-key-9999');

    // 3. Click Save API Key
    const saveBtn = page.locator('#btn-save-credential');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // 4. Verify dialog closes and success notice appears
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/securely encrypted with aes-256-gcm/i)).toBeVisible();

    // 5. Verify the plaintext secret is NOT present anywhere in the DOM
    const htmlContent = await page.content();
    expect(htmlContent).not.toContain('sk-or-v1-secret-test-key-9999');
  });

  test('PROV-E2E-003: Tests provider connection and displays verified status badge', async ({
    page,
  }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // 1. Click Test Connection button for OpenAI
    const testBtn = page.locator('#btn-test-openai');
    await expect(testBtn).toBeVisible();
    await testBtn.click();

    // 2. Verify success banner appears with latency
    await expect(page.getByRole('heading', { level: 4, name: /probe succeeded/i })).toBeVisible();
    await expect(page.getByText(/latency: 142ms/i)).toBeVisible();
  });

  test('PROV-E2E-004: Toggles provider enabled and disabled state', async ({ page }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // 1. Locate OpenAI toggle
    const toggle = page.locator('#toggle-openai');
    await expect(toggle).toBeVisible();
    expect(await toggle.isChecked()).toBe(true);

    // 2. Toggle off
    await toggle.uncheck();
    expect(await toggle.isChecked()).toBe(false);

    // 3. Toggle back on
    await toggle.check();
    expect(await toggle.isChecked()).toBe(true);
  });

  test('PROV-E2E-005: Deletes provider configuration securely with confirmation dialog', async ({
    page,
  }) => {
    await mockProviderSettingsApis(page);

    await page.goto('/settings/providers');

    // 1. Click Remove button for OpenAI
    const removeBtn = page.locator('#btn-remove-openai');
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // 2. Confirm removal in dialog
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await expect(page.getByText(/this action will permanently delete your encrypted api key/i)).toBeVisible();

    const confirmBtn = page.locator('#btn-confirm-delete');
    await confirmBtn.click();

    // 3. Verify dialog closes and notice appears
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByText(/configuration and encrypted secret removed from vault/i)).toBeVisible();

    // 4. Verify OpenAI is now unconfigured
    await expect(page.locator('#btn-configure-openai')).toHaveText('Configure Key');
  });
});

