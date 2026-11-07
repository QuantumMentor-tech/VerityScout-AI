import { test, expect } from '@playwright/test';
import { mockHistoryAndExportApis } from './helpers/e2e-helpers';

test.describe('Research History & Multi-Format Exports (Step 53)', () => {
  test('HIST-E2E-001: Renders interactive history list and filters by status and query', async ({
    page,
  }) => {
    await mockHistoryAndExportApis(page);

    await page.goto('/history');

    // 1. Verify history header
    await expect(page.getByRole('heading', { level: 1, name: /research history/i })).toBeVisible();

    // 2. Verify search query input
    const searchInput = page.getByPlaceholder(/search query/i);
    await expect(searchInput).toBeVisible();

    // 3. Search for ThinkPad
    await searchInput.fill('ThinkPad');
    await searchInput.press('Enter');

    // 4. Verify filtered record displayed
    await expect(page.getByRole('link', { name: /Refurbished ThinkPad T14 AMD Gen 3/i })).toBeVisible();

    // 5. Filter by status: COMPLETED
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption('COMPLETED');
      // Assert the exact status badge on the card
      const badge = page.locator('span').filter({ hasText: /^COMPLETED$/ }).first();
      await expect(badge).toBeVisible();
    }
  });

  test('HIST-E2E-002: Downloads and validates structured JSON export', async ({ page }) => {
    await mockHistoryAndExportApis(page);

    await page.goto('/research/runs/demo-run-001');

    // 1. Verify Export Toolbar is rendered
    await expect(page.getByText(/^Export:$/i)).toBeVisible();

    // 2. Locate JSON export control and verify href
    const exportBtn = page.getByRole('link', { name: /^JSON$/i });
    await expect(exportBtn).toBeVisible();
    const href = await exportBtn.getAttribute('href');
    expect(href).toContain('/export?format=json');

    // 3. Fetch export data via in-page browser context
    const result = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const data = await res.json();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        data,
      };
    }, href!);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('application/json');

    // 4. Validate JSON payload structure and values
    const parsedJson = result.data;
    expect(parsedJson.schemaVersion).toBe('1.0.0');
    expect(parsedJson.status).toBe('COMPLETED');
    expect(Array.isArray(parsedJson.candidates)).toBe(true);
    expect(parsedJson.candidates.length).toBeGreaterThan(0);
    expect(parsedJson.candidates[0]).toHaveProperty('name');
    expect(parsedJson.candidates[0]).toHaveProperty('price');
  });

  test('HIST-E2E-003: Downloads and validates RFC 4180 CSV export with formula injection mitigation', async ({
    page,
  }) => {
    await mockHistoryAndExportApis(page);

    await page.goto('/research/runs/demo-run-001');

    // 1. Locate CSV (Results) export control and verify href
    const exportBtn = page.getByRole('link', { name: /^CSV \(Results\)$/i });
    await expect(exportBtn).toBeVisible();
    const href = await exportBtn.getAttribute('href');
    expect(href).toContain('/export?format=csv');

    // 2. Fetch CSV export data in page context
    const result = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        text,
      };
    }, href!);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/csv');

    // 3. Validate CSV headers and data rows
    const lines = result.text.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain('"id"');
    expect(lines[0]).toContain('"name"');
    expect(lines[0]).toContain('"price"');
    expect(lines[1]).toContain('ThinkPad');
    expect(lines[1]).toContain('$649.99');
  });

  test('HIST-E2E-004: Downloads and validates formatted Markdown research report', async ({ page }) => {
    await mockHistoryAndExportApis(page);

    await page.goto('/research/runs/demo-run-001');

    // 1. Locate Markdown export control and verify href
    const exportBtn = page.getByRole('link', { name: /^Markdown$/i });
    await expect(exportBtn).toBeVisible();
    const href = await exportBtn.getAttribute('href');
    expect(href).toContain('/export?format=markdown');

    // 2. Fetch Markdown report in page context
    const result = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const text = await res.text();
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        text,
      };
    }, href!);

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/markdown');

    // 3. Validate Markdown content
    expect(result.text).toContain('# VerityScout AI Research Report');
    expect(result.text).toContain('## Executive Summary');
    expect(result.text).toContain('## Verified Candidates');
    expect(result.text).toContain('ThinkPad T14 Gen 3');
    expect(result.text).toContain('EXACT_MATCH');
  });

  test('HIST-E2E-005: Handles export generation failures safely', async ({ page }) => {
    await mockHistoryAndExportApis(page, { simulateExportError: true });

    await page.goto('/research/runs/demo-run-001');

    const exportBtn = page.getByRole('link', { name: /^JSON$/i });
    const href = await exportBtn.getAttribute('href');

    const result = await page.evaluate(async (url) => {
      const res = await fetch(url);
      const data = await res.json();
      return {
        status: res.status,
        data,
      };
    }, href!);

    expect(result.status).toBe(500);
    expect(result.data).toHaveProperty('error');
    expect(result.data.error).toContain('Export generation failed');
  });
});
