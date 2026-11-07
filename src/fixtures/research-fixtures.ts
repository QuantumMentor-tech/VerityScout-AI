import type { SampleResearchRun } from './types';

export const DEMO_RUNS: Readonly<Record<string, SampleResearchRun>> = {
  'demo-run-001': {
    id: 'demo-run-001',
    query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
    status: 'completed',
    createdAt: '2026-10-30T14:20:00Z',
    completedAt: '2026-10-30T14:21:18Z',
    sourcesScanned: 14,
    candidatesFound: 3,
    candidates: [
      {
        id: 'cand-001',
        name: 'Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 7 PRO 6850U, 32GB LPDDR5, 512GB SSD)',
        price: '$649.99',
        retailer: 'eBay Refurbished (Direct)',
        url: 'https://example.com/items/thinkpad-t14-gen3-32gb',
        verifiedAttributes: [
          { key: 'Price ($)', value: '$649.99 (< $700.00 ceiling)', matchesConstraint: true },
          { key: 'Memory (RAM)', value: '32GB LPDDR5-6400 (matches requirement)', matchesConstraint: true },
          { key: 'Processor', value: 'AMD Ryzen 7 PRO 6850U (8C/16T)', matchesConstraint: true },
          { key: 'Condition', value: 'Certified Refurbished (Grade A)', matchesConstraint: true },
        ],
        tier: 'Strong Match',
      },
      {
        id: 'cand-002',
        name: 'Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 5 PRO 6650U, 16GB RAM, 256GB SSD)',
        price: '$529.00',
        retailer: 'Amazon Renewed Store',
        url: 'https://example.com/items/thinkpad-t14-gen3-16gb',
        verifiedAttributes: [
          { key: 'Price ($)', value: '$529.00 (< $700.00 ceiling)', matchesConstraint: true },
          { key: 'Memory (RAM)', value: '16GB (fails 32GB constraint)', matchesConstraint: false },
          { key: 'Condition', value: 'Refurbished (Excellent)', matchesConstraint: true },
        ],
        tier: 'Near Match',
      },
    ],
  },
  'run-e2e-live-001': {
    id: 'run-e2e-live-001',
    query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
    status: 'completed',
    createdAt: '2026-11-07T08:00:00Z',
    completedAt: '2026-11-07T08:01:25Z',
    sourcesScanned: 12,
    candidatesFound: 2,
    candidates: [
      {
        id: 'cand-001',
        name: 'Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 7 PRO 6850U, 32GB LPDDR5, 512GB SSD)',
        price: '$649.99',
        retailer: 'eBay Refurbished (Direct)',
        url: 'https://example.com/items/thinkpad-t14-gen3-32gb',
        verifiedAttributes: [
          { key: 'Price ($)', value: '$649.99 (< $700.00 ceiling)', matchesConstraint: true },
          { key: 'Memory (RAM)', value: '32GB LPDDR5-6400 (matches requirement)', matchesConstraint: true },
          { key: 'Condition', value: 'Certified Refurbished (Grade A)', matchesConstraint: true },
        ],
        tier: 'Strong Match',
      },
    ],
  },
  'run-e2e-cancel-001': {
    id: 'run-e2e-cancel-001',
    query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
    status: 'in_progress',
    createdAt: '2026-11-07T08:00:00Z',
    sourcesScanned: 5,
    candidatesFound: 1,
    candidates: [
      {
        id: 'cand-001',
        name: 'Lenovo ThinkPad T14 Gen 3 (AMD Ryzen 7 PRO 6850U, 32GB LPDDR5, 512GB SSD)',
        price: '$649.99',
        retailer: 'eBay Refurbished (Direct)',
        url: 'https://example.com/items/thinkpad-t14-gen3-32gb',
        verifiedAttributes: [
          { key: 'Price ($)', value: '$649.99 (< $700.00 ceiling)', matchesConstraint: true },
        ],
        tier: 'Strong Match',
      },
    ],
  },
};

export function getDemoRunById(runId: string): SampleResearchRun | undefined {
  return DEMO_RUNS[runId];
}
