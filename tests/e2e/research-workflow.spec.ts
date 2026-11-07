import { test, expect } from '@playwright/test';
import { mockResearchApis } from './helpers/e2e-helpers';
import { MOCK_E2E_RESEARCH_RUN } from './fixtures/mock-data';

test.describe('Research Submission & Results Workflow (Step 53)', () => {
  test('RESEARCH-E2E-001: Submits valid research query and transitions to active progress tracking', async ({
    page,
  }) => {
    await mockResearchApis(page);

    await page.goto('/research');

    // 1. Verify heading and composer presence
    await expect(page.getByRole('heading', { level: 1, name: /research workspace/i })).toBeVisible();

    const textarea = page.getByLabel(/research question or topic/i);
    await expect(textarea).toBeVisible();

    // 2. Type valid research query
    await textarea.fill('Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700');

    // 3. Click Validate & Stage Query button
    const stageButton = page.getByRole('button', { name: /validate & stage query/i });
    await expect(stageButton).toBeEnabled();
    await stageButton.click();

    // 4. Verify staging confirmation card appears
    await expect(
      page.getByRole('heading', { level: 3, name: /ready to launch asynchronous research/i })
    ).toBeVisible();

    // 5. Submit the research run
    const launchButton = page.getByRole('button', { name: /launch asynchronous research run/i });
    await expect(launchButton).toBeVisible();
    await launchButton.click();

    // 6. Verify navigation to the run detail route
    await page.waitForURL(new RegExp(`/research/runs/${MOCK_E2E_RESEARCH_RUN.id}`));
    await expect(page.getByRole('heading', { level: 1, name: /research run detail/i })).toBeVisible();

    // 7. Verify progress tracker card renders
    await expect(
      page.getByRole('heading', { level: 2, name: /research pipeline lifecycle & progress/i })
    ).toBeVisible();
  });

  test('RESEARCH-E2E-002: Observes deterministic candidate results, tiers, and constraint compliance', async ({
    page,
  }) => {
    // Navigate directly to the deterministic benchmark fixture demo-run-001
    await page.goto('/research/runs/demo-run-001');

    // 1. Verify heading and fixture badge
    await expect(page.getByRole('heading', { level: 1, name: /research run detail/i })).toBeVisible();
    await expect(page.getByText('Deterministic Fixture Record')).toBeVisible();

    // 2. Verify candidate card rendered via testid
    const candidateCard = page.getByTestId('candidate-card-cand-001');
    await expect(candidateCard).toBeVisible();
    await expect(candidateCard.getByRole('heading', { level: 3 })).toContainText(/thinkpad t14/i);

    // 3. Verify match classification badges
    await expect(page.getByText('Strong Match')).toBeVisible();
    await expect(page.getByText('Near Match')).toBeVisible();

    // 4. Verify constraint attributes table
    await expect(page.getByText('$649.99 (< $700.00 ceiling)')).toBeVisible();
    await expect(page.getByText('32GB LPDDR5-6400 (matches requirement)')).toBeVisible();
  });

  test('RESEARCH-E2E-003: Cancels an active research run and verifies termination status', async ({
    page,
  }) => {
    const runningFixture = {
      ...MOCK_E2E_RESEARCH_RUN,
      id: 'run-e2e-cancel-001',
      status: 'RUNNING' as const,
      currentStage: 'SEARCH',
      progressPercent: 35,
    };

    await mockResearchApis(page, { run: runningFixture });

    // Open running run page directly
    await page.goto(`/research/runs/${runningFixture.id}`);

    // Verify progress tracker indicates running/active state
    await expect(
      page.getByRole('heading', { level: 2, name: /research pipeline lifecycle & progress/i })
    ).toBeVisible();

    // Click Cancel Research Run button
    const cancelBtn = page.getByRole('button', { name: /cancel research run/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Verify cancellation feedback message appears
    await expect(
      page.getByText(/cancellation successfully requested/i)
    ).toBeVisible();
  });

  test('RESEARCH-E2E-004: Handles research submission API failure gracefully', async ({ page }) => {
    await mockResearchApis(page, {
      submitStatus: 503,
      submitError: 'Persistent research worker queue is temporarily unavailable',
    });

    await page.goto('/research');

    const textarea = page.getByLabel(/research question or topic/i);
    await textarea.fill('Valid query to test submission failure behavior');
    await page.getByRole('button', { name: /validate & stage query/i }).click();

    const launchButton = page.getByRole('button', { name: /launch asynchronous research run/i });
    await launchButton.click();

    // Verify error alert is rendered without crashing the page
    const alert = page.getByRole('alert').filter({ hasText: /worker queue is temporarily unavailable/i });
    await expect(alert).toBeVisible();

    // Verify the page remains interactive
    await expect(launchButton).toBeEnabled();
  });
});
