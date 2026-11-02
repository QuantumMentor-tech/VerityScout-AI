import { test, expect } from '@playwright/test';

test.describe('Authentication Pages & Navigation (Step 23)', () => {
  test('login page renders accessible form elements', async ({ page }) => {
    await page.goto('/login');

    // Title and headings
    await expect(page.getByRole('heading', { level: 1, name: /sign in to verityscout ai/i })).toBeVisible();

    // Inputs and labels
    const emailInput = page.getByLabel(/email address/i);
    await expect(emailInput).toBeVisible();

    const passwordInput = page.getByLabel(/^password/i);
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Show/hide password button
    const toggleButton = page.getByRole('button', { name: /show password/i });
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Submit button
    const submitButton = page.getByRole('button', { name: /^sign in$/i });
    await expect(submitButton).toBeVisible();

    // Link to register
    const registerLink = page.getByRole('link', { name: /create private account/i });
    await expect(registerLink).toBeVisible();
  });

  test('submitting empty credentials shows validation alert', async ({ page }) => {
    await page.goto('/login');

    const submitButton = page.getByRole('button', { name: /^sign in$/i });
    await submitButton.click();

    const alert = page.getByRole('alert').filter({ hasText: /please enter both your email address and password/i });
    await expect(alert).toBeVisible();
  });

  test('register page renders accessible fields and validates password match', async ({ page }) => {
    await page.goto('/register');

    // Headings
    await expect(page.getByRole('heading', { level: 1, name: /create private account/i })).toBeVisible();

    // Fields
    const nameInput = page.getByLabel(/display name/i);
    await expect(nameInput).toBeVisible();

    const emailInput = page.getByLabel(/email address/i);
    await expect(emailInput).toBeVisible();

    const passwordInput = page.getByLabel(/^password/i);
    await expect(passwordInput).toBeVisible();

    const confirmInput = page.getByLabel(/confirm password/i);
    await expect(confirmInput).toBeVisible();

    // Fill mismatched passwords
    await emailInput.fill('user@local.pc');
    await passwordInput.fill('SecretPassword123!');
    await confirmInput.fill('DifferentPassword999!');

    const createButton = page.getByRole('button', { name: /create private account/i });
    await createButton.click();

    // Validation alert
    const alert = page.getByRole('alert').filter({ hasText: /passwords do not match/i });
    await expect(alert).toBeVisible();

  });

  test('header contains sign in navigation button when unauthenticated', async ({ page }) => {
    await page.goto('/');

    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toBeVisible();
    await signInLink.click();

    await expect(page).toHaveURL(/\/login/);
  });
});
