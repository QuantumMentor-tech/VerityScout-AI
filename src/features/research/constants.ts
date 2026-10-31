import type { ExampleQuery } from './types';

/**
 * Maximum character limit for natural-language research questions.
 * Explicitly established in UR-001 and AC-001.
 */
export const MAX_QUERY_LENGTH = 1000;

export const EMPTY_QUERY_ERROR = 'Enter a research question to continue.';
export const OVER_LIMIT_ERROR = 'Query exceeds maximum length of 1,000 characters.';

/**
 * Curated example research queries representing realistic multi-constraint
 * autonomous research requests.
 */
export const EXAMPLE_QUERIES: readonly ExampleQuery[] = [
  {
    id: 'thinkpad-t14',
    label: 'ThinkPad T14 Gen 3',
    category: 'Laptops',
    query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
  },
  {
    id: 'gpu-rtx4080',
    label: 'RTX 4080 Super',
    category: 'PC Hardware',
    query: 'RTX 4080 Super GPU under $950 in new condition with at least 3 display ports, excluding open-box',
  },
  {
    id: 'headphones-sony',
    label: 'Sony WH-1000XM5',
    category: 'Audio',
    query: 'Sony WH-1000XM5 headphones under $300 in new condition, black color only, exclude eBay',
  },
] as const;
