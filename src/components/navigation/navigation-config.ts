/**
 * ==============================================================================
 * VerityScout AI — Navigation Configuration
 * ==============================================================================
 * Governed by: Step 13 (Responsive Application Shell & Navigation)
 * Phase: 3 of 12 (Frontend Architecture & Design System)
 *
 * Establishes typed navigation metadata separating route inventory data from presentation.
 * Invariant: Every enabled item MUST point to an actual implemented route.
 * Planned items must NOT contain placeholder links, fake routes, or broken anchors.
 * ==============================================================================
 */

export type NavigationGroup = 'workspace' | 'system';

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly isImplemented: boolean;
  readonly badge?: string;
  readonly group: NavigationGroup;
  readonly description?: string;
}

export const NAVIGATION_GROUPS: ReadonlyArray<{
  readonly id: NavigationGroup;
  readonly title: string;
}> = [
  { id: 'workspace', title: 'Research Workspace' },
  { id: 'system', title: 'System & Engine' },
] as const;

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/',
    isImplemented: true,
    group: 'workspace',
    description: 'Platform baseline, system status, and environment health',
  },
  {
    id: 'research',
    label: 'Research Query',
    href: '/research',
    isImplemented: true,
    group: 'workspace',
    description: 'Autonomous research execution and query intake shell',
  },
  {
    id: 'evidence',
    label: 'Evidence Explorer',
    isImplemented: false,
    badge: 'Step 23',
    group: 'workspace',
    description: 'Deterministic evidence extraction and constraint verification (Step 23+)',
  },
  {
    id: 'history',
    label: 'Run History',
    href: '/history',
    isImplemented: true,
    group: 'workspace',
    description: 'Research audit trail and past verification sessions',
  },
  {
    id: 'schedules',
    label: 'Scheduled Monitors',
    href: '/schedules',
    isImplemented: true,
    group: 'system',
    description: 'Recurring automated research and change verification jobs',
  },
  {
    id: 'settings',
    label: 'Provider Settings',
    href: '/settings/providers',
    isImplemented: true,
    group: 'system',
    description: 'AI model configuration and multi-provider credentials shell',
  },
] as const;
