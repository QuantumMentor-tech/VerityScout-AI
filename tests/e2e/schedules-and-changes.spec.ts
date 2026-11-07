import { test, expect } from '@playwright/test';
import { mockScheduleApis } from './helpers/e2e-helpers';

test.describe('Schedule Management & Change Monitoring (Step 53)', () => {
  test('SCHED-E2E-001: Renders active schedules list and creates a recurring monitor', async ({
    page,
  }) => {
    await mockScheduleApis(page);

    await page.goto('/schedules');

    // 1. Verify heading
    await expect(page.getByRole('heading', { level: 1, name: /scheduled monitors/i })).toBeVisible();

    // 2. Open schedule creation form
    const createBtn = page.getByRole('button', { name: /\+ create recurring schedule/i });
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // 3. Fill query and optional name
    const queryInput = page.getByLabel(/research query \*/i);
    await expect(queryInput).toBeVisible();
    await queryInput.fill('ThinkPad T14 AMD Gen 3 Daily Price Watch');

    const nameInput = page.getByLabel(/schedule name \(optional\)/i);
    await nameInput.fill('ThinkPad Daily E2E Watcher');

    // 4. Save schedule
    const saveBtn = page.getByRole('button', { name: /save & activate schedule/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // 5. Verify success alert appears
    await expect(page.getByText(/schedule created successfully/i)).toBeVisible();
  });

  test('SCHED-E2E-002: Pauses and resumes an active schedule with immediate UI feedback', async ({
    page,
  }) => {
    await mockScheduleApis(page);

    await page.goto('/schedules');

    // 1. Verify the ThinkPad schedule card is visible
    const schedTitle = page.getByRole('heading', {
      level: 3,
      name: /thinkpad t14 weekly price monitor/i,
    });
    await expect(schedTitle).toBeVisible();

    // 2. Click Pause button on the active schedule
    const pauseBtn = page.getByRole('button', { name: /^pause$/i }).first();
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();

    // 3. Verify success alert for pause
    await expect(page.getByText(/schedule paused successfully/i)).toBeVisible();

    // 4. Click Resume button
    const resumeBtn = page.getByRole('button', { name: /^resume$/i }).first();
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();

    // 5. Verify success alert for resume
    await expect(page.getByText(/schedule resumed successfully/i)).toBeVisible();
  });

  test('SCHED-E2E-003: Expands and verifies occurrence ledger history', async ({ page }) => {
    await mockScheduleApis(page);

    await page.goto('/schedules');

    // 1. Click Occurrences button
    const occurrencesBtn = page.getByRole('button', { name: /^occurrences$/i }).first();
    await expect(occurrencesBtn).toBeVisible();
    await occurrencesBtn.click();

    // 2. Verify Occurrence ledger container expands
    await expect(
      page.getByRole('heading', { level: 4, name: /recent execution occurrences/i })
    ).toBeVisible();

    // 3. Verify occurrence record link to research run
    const runLink = page.getByRole('link', { name: /run-e2e-/i }).first();
    await expect(runLink).toBeVisible();
    await expect(runLink).toHaveAttribute('href', /^\/research\/runs\/run-e2e-/);
  });

  test('SCHED-E2E-004: Expands and inspects detected research change records', async ({ page }) => {
    await mockScheduleApis(page);

    await page.goto('/schedules');

    // 1. Click Changes button
    const changesBtn = page.getByRole('button', { name: /^changes$/i }).first();
    await expect(changesBtn).toBeVisible();
    await changesBtn.click();

    // 2. Verify detected changes container
    await expect(
      page.getByRole('heading', { level: 4, name: /detected observation changes/i })
    ).toBeVisible();

    // 3. Verify price drop change title and description
    await expect(page.getByText(/price drop/i).first()).toBeVisible();
    await expect(page.getByText(/ebay refurbished price reduced/i)).toBeVisible();
  });
});
