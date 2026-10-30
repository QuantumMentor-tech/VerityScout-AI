import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Allow testing server-side utilities under jsdom test environment
vi.mock('server-only', () => ({}));
