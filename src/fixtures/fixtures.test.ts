import { describe, it, expect } from 'vitest';
import {
  DEMO_RUNS,
  getDemoRunById,
  OVERVIEW_METRICS_FIXTURE,
  OVERVIEW_ACTIVITIES_FIXTURE,
  HISTORY_RECORDS_FIXTURE,
  SCHEDULES_FIXTURE,
  PROVIDERS_FIXTURE,
} from './index';

describe('Fixture Data Integrity & Security', () => {
  it('provides deterministic demo runs and safely handles unknown IDs', () => {
    const run = getDemoRunById('demo-run-001');
    expect(run).toBeDefined();
    expect(run?.id).toBe('demo-run-001');
    expect(run?.query).toContain('ThinkPad');
    expect(run?.candidates.length).toBeGreaterThan(0);

    // Unknown run returns undefined
    const missingRun = getDemoRunById('arbitrary-unknown-id');
    expect(missingRun).toBeUndefined();
  });

  it('contains no real API keys, secrets, or credential tokens', () => {
    const allFixturesString = JSON.stringify({
      DEMO_RUNS,
      OVERVIEW_METRICS_FIXTURE,
      OVERVIEW_ACTIVITIES_FIXTURE,
      HISTORY_RECORDS_FIXTURE,
      SCHEDULES_FIXTURE,
      PROVIDERS_FIXTURE,
    });

    expect(allFixturesString).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI key pattern
    expect(allFixturesString).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/); // GitHub token pattern
    expect(allFixturesString).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/); // JWT token pattern
    expect(allFixturesString).not.toContain('password');
    expect(allFixturesString).not.toContain('secret_key');
  });

  it('contains structured overview metrics and activities', () => {
    expect(OVERVIEW_METRICS_FIXTURE.length).toBeGreaterThanOrEqual(4);
    expect(OVERVIEW_ACTIVITIES_FIXTURE.length).toBeGreaterThanOrEqual(3);

    for (const activity of OVERVIEW_ACTIVITIES_FIXTURE) {
      expect(activity.id).toBeDefined();
      expect(activity.title).toBeDefined();
      expect(activity.status).toBeDefined();
    }
  });

  it('contains deterministic history records with valid runId references', () => {
    expect(HISTORY_RECORDS_FIXTURE.length).toBeGreaterThanOrEqual(3);
    for (const record of HISTORY_RECORDS_FIXTURE) {
      expect(record.id).toMatch(/^demo-history-\d+$/);
      expect(record.runId).toBeDefined();
    }
  });

  it('contains scheduled monitors and provider catalog without live connections', () => {
    expect(SCHEDULES_FIXTURE.length).toBeGreaterThanOrEqual(2);
    expect(PROVIDERS_FIXTURE.length).toBeGreaterThanOrEqual(4);

    for (const provider of PROVIDERS_FIXTURE) {
      expect(provider.status).toBe('Planned (Phase 5)');
      expect(provider.supportedModels.length).toBeGreaterThan(0);
    }
  });
});
