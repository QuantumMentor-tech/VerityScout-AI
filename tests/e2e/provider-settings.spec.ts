import { test, expect } from '@playwright/test';

test.describe('Provider Settings Page (/settings/providers) — Step 26 E2E', () => {
  test('E2E-PROV-001: Renders Provider Settings header and baseline provider cards', async ({ page }) => {
    // Intercept providers API to return baseline unconfigured state
    await page.route('/api/settings/providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            {
              id: 'openai',
              name: 'OpenAI',
              description: 'Industry-standard frontier models including GPT-4o.',
              category: 'Primary AI Model',
              docsUrl: 'https://platform.openai.com/api-keys',
              keyPlaceholder: 'sk-proj-...',
              helpText: 'Generate a secret key from your OpenAI dashboard.',
              isConfigured: false,
              isEnabled: true,
              credentialPreview: null,
              lastConnectionTestStatus: 'UNTESTED',
              lastConnectionTestAt: null,
              selectedModelId: null,
              updatedAt: null,
            },
            {
              id: 'openrouter',
              name: 'OpenRouter',
              description: 'Unified multi-provider gateway supporting open weights.',
              category: 'Multi-Model Router',
              docsUrl: 'https://openrouter.ai/keys',
              keyPlaceholder: 'sk-or-v1-...',
              helpText: 'Obtain an API key from OpenRouter settings.',
              isConfigured: false,
              isEnabled: true,
              credentialPreview: null,
              lastConnectionTestStatus: 'UNTESTED',
              lastConnectionTestAt: null,
              selectedModelId: null,
              updatedAt: null,
            },
            {
              id: 'nim',
              name: 'NVIDIA NIM',
              description: 'Hardware-accelerated inference microservices.',
              category: 'High-Performance Inference',
              docsUrl: 'https://build.nvidia.com',
              keyPlaceholder: 'nvapi-...',
              helpText: 'Generate an API key from NVIDIA Build platform.',
              isConfigured: false,
              isEnabled: true,
              credentialPreview: null,
              lastConnectionTestStatus: 'UNTESTED',
              lastConnectionTestAt: null,
              selectedModelId: null,
              updatedAt: null,
            },
          ],
        }),
      });
    });

    await page.goto('/settings/providers');

    // Verify page header
    const title = page.locator('h1', { hasText: 'Provider Settings' });
    await expect(title).toBeVisible();

    const badge = page.getByText('AES-256-GCM Encrypted');
    await expect(badge).toBeVisible();

    // Verify 3 baseline provider cards
    await expect(page.getByRole('heading', { level: 2, name: 'OpenAI' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'OpenRouter' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'NVIDIA NIM' })).toBeVisible();
  });

  test('E2E-PROV-002: Opens configuration dialog and validates password input masking', async ({ page }) => {
    await page.route('/api/settings/providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            {
              id: 'openai',
              name: 'OpenAI',
              description: 'Industry-standard frontier models including GPT-4o.',
              category: 'Primary AI Model',
              docsUrl: 'https://platform.openai.com/api-keys',
              keyPlaceholder: 'sk-proj-...',
              helpText: 'Generate a secret key from your OpenAI dashboard.',
              isConfigured: false,
              isEnabled: true,
              credentialPreview: null,
              lastConnectionTestStatus: 'UNTESTED',
              lastConnectionTestAt: null,
              selectedModelId: null,
              updatedAt: null,
            },
          ],
        }),
      });
    });

    await page.goto('/settings/providers');

    // Click Configure Key button
    const configureBtn = page.locator('#btn-configure-openai');
    await expect(configureBtn).toBeVisible();
    await configureBtn.click();

    // Check dialog visibility
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Verify input is of type password (preventing screen shoulder surfing)
    const keyInput = page.locator('input[type="password"]');
    await expect(keyInput).toBeVisible();
    await expect(keyInput).toHaveAttribute('placeholder', 'sk-proj-...');

    // Close dialog with cancel button
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });
});
