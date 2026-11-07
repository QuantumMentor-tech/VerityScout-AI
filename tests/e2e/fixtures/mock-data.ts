/**
 * Deterministic Mock Data Fixtures for Playwright E2E Browser Testing.
 * Complies with strict TypeScript and isolated test environment standards.
 */

export interface E2ECandidate {
  id: string;
  name: string;
  price: string;
  retailer: string;
  url: string;
  tier: 'Strong Match' | 'Near Match' | 'Uncertain';
  classification?: string;
  verifiedAttributes: Array<{
    key: string;
    value: string;
    matchesConstraint: boolean;
  }>;
}

export interface E2EProgressEvent {
  id: string;
  stage: string;
  eventType: string;
  sequenceNumber: number;
  message: string;
  createdAt: string;
}

export interface E2EResearchRun {
  id: string;
  query: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  currentStage: string;
  progressPercent: number;
  sourcesScanned: number;
  candidatesFound: number;
  createdAt: string;
  completedAt: string | null;
  events: E2EProgressEvent[];
  candidates: E2ECandidate[];
}

export interface E2ESchedule {
  id: string;
  name: string | null;
  revision: number;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DISABLED_ERROR';
  cron_expression: string;
  scheduled_time: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_dispatched_at: string | null;
  last_run_id: string | null;
  request_snapshot?: {
    query?: string;
    taskType?: string;
  };
}

export interface E2EOccurrence {
  id: string;
  scheduled_at: string;
  status: string;
  dispatched_at: string | null;
  research_run_id: string | null;
  error_message: string | null;
  schedule_revision: number;
}

export interface E2EChangeItem {
  id: string;
  scheduleId?: string;
  scheduleName?: string;
  runId: string;
  entityType: 'CANDIDATE' | 'ATTRIBUTE' | 'SOURCE' | 'SUMMARY';
  changeType:
    | 'NEW_CANDIDATE_OBSERVED'
    | 'CANDIDATE_NO_LONGER_OBSERVED'
    | 'PRICE_DROP'
    | 'PRICE_INCREASE'
    | 'STOCK_STATUS_CHANGED'
    | 'SPECIFICATION_UPDATED'
    | 'NEW_OFFER_DISCOVERED'
    | 'OFFER_RETRACTED'
    | 'ATTRIBUTE_NO_LONGER_OBSERVED'
    | 'CONFLICTING_EVIDENCE_OBSERVED';
  severity: 'INFO' | 'NOTABLE' | 'SIGNIFICANT' | 'CRITICAL';
  title: string;
  description: string;
  previousValue: string | null;
  currentValue: string | null;
  detectedAt: string;
  candidateName?: string;
}

export interface E2ENotification {
  id: string;
  user_id: string;
  research_run_id: string;
  schedule_id: string | null;
  change_event_id: string | null;
  notification_type: string;
  severity: string;
  title: string;
  summary: string;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

export interface E2EProviderSettings {
  id: string;
  name: string;
  description: string;
  category: string;
  docsUrl: string;
  keyPlaceholder: string;
  helpText: string;
  isConfigured: boolean;
  isEnabled: boolean;
  credentialPreview: string | null;
  lastConnectionTestStatus: 'UNTESTED' | 'TEST_SUCCESS' | 'TEST_FAILED';
  lastConnectionTestAt: string | null;
  selectedModelId: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Research Run Mock Fixture
// ---------------------------------------------------------------------------
export const MOCK_E2E_RESEARCH_RUN: E2EResearchRun = {
  id: 'run-e2e-live-001',
  query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
  status: 'COMPLETED',
  currentStage: 'SYNTHESIS',
  progressPercent: 100,
  sourcesScanned: 12,
  candidatesFound: 2,
  createdAt: '2026-11-07T08:00:00Z',
  completedAt: '2026-11-07T08:01:25Z',
  events: [
    {
      id: 'evt-1',
      stage: 'INGESTION',
      eventType: 'TASK_ENQUEUED',
      sequenceNumber: 1,
      message: 'Research query accepted and enqueued for worker daemon',
      createdAt: '2026-11-07T08:00:01Z',
    },
    {
      id: 'evt-2',
      stage: 'SEARCH',
      eventType: 'DISCOVERY_COMPLETED',
      sequenceNumber: 2,
      message: 'Identified 12 verified web sources matching query constraints',
      createdAt: '2026-11-07T08:00:15Z',
    },
    {
      id: 'evt-3',
      stage: 'EXTRACTION',
      eventType: 'CLAIMS_EXTRACTED',
      sequenceNumber: 3,
      message: 'Extracted candidate specifications, prices, and seller ratings',
      createdAt: '2026-11-07T08:00:45Z',
    },
    {
      id: 'evt-4',
      stage: 'SYNTHESIS',
      eventType: 'RUN_COMPLETED',
      sequenceNumber: 4,
      message: 'Synthesis complete: 1 exact match and 1 near match verified',
      createdAt: '2026-11-07T08:01:25Z',
    },
  ],
  candidates: [
    {
      id: 'cand-e2e-001',
      name: 'Lenovo ThinkPad T14 Gen 3 AMD Ryzen 7 32GB RAM',
      price: '$649.99',
      retailer: 'eBay Refurbished Direct',
      url: 'https://example.com/item/thinkpad-t14-gen3',
      tier: 'Strong Match',
      classification: 'EXACT_MATCH',
      verifiedAttributes: [
        { key: 'Price', value: '$649.99 (Ceiling $700.00)', matchesConstraint: true },
        { key: 'Memory', value: '32GB LPDDR5-6400', matchesConstraint: true },
        { key: 'Condition', value: 'Certified Refurbished (Grade A)', matchesConstraint: true },
      ],
    },
    {
      id: 'cand-e2e-002',
      name: 'Lenovo ThinkPad T14 Gen 3 AMD Ryzen 5 16GB RAM',
      price: '$529.00',
      retailer: 'Amazon Renewed',
      url: 'https://example.com/item/thinkpad-t14-16gb',
      tier: 'Near Match',
      classification: 'NEAR_MATCH',
      verifiedAttributes: [
        { key: 'Price', value: '$529.00 (Ceiling $700.00)', matchesConstraint: true },
        { key: 'Memory', value: '16GB (Requires 32GB)', matchesConstraint: false },
        { key: 'Condition', value: 'Renewed', matchesConstraint: true },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Schedule Mock Fixture
// ---------------------------------------------------------------------------
export const MOCK_E2E_SCHEDULES: E2ESchedule[] = [
  {
    id: 'sched-e2e-001',
    name: 'ThinkPad T14 Weekly Price Monitor',
    revision: 1,
    status: 'ACTIVE',
    cron_expression: '0 9 * * 1',
    scheduled_time: '09:00',
    timezone: 'America/New_York',
    next_run_at: '2026-11-10T14:00:00Z',
    last_run_at: '2026-11-03T14:00:00Z',
    last_dispatched_at: '2026-11-03T14:00:00Z',
    last_run_id: 'run-e2e-live-001',
    request_snapshot: {
      query: 'Refurbished ThinkPad T14 AMD Gen 3 with 32GB RAM under $700',
      taskType: 'SCHEDULED_MONITOR',
    },
  },
  {
    id: 'sched-e2e-002',
    name: 'MacBook Air M2 Daily Tracker',
    revision: 2,
    status: 'PAUSED',
    cron_expression: '0 8 * * *',
    scheduled_time: '08:00',
    timezone: 'UTC',
    next_run_at: null,
    last_run_at: '2026-11-06T08:00:00Z',
    last_dispatched_at: '2026-11-06T08:00:00Z',
    last_run_id: 'run-e2e-live-002',
    request_snapshot: {
      query: 'MacBook Air M2 16GB RAM 512GB SSD under $900',
      taskType: 'SCHEDULED_MONITOR',
    },
  },
];

export const MOCK_E2E_OCCURRENCES: E2EOccurrence[] = [
  {
    id: 'occ-e2e-001',
    scheduled_at: '2026-11-03T14:00:00Z',
    status: 'COMPLETED',
    dispatched_at: '2026-11-03T14:00:02Z',
    research_run_id: 'run-e2e-live-001',
    error_message: null,
    schedule_revision: 1,
  },
  {
    id: 'occ-e2e-002',
    scheduled_at: '2026-10-27T14:00:00Z',
    status: 'COMPLETED',
    dispatched_at: '2026-10-27T14:00:01Z',
    research_run_id: 'run-e2e-past-001',
    error_message: null,
    schedule_revision: 1,
  },
];

export const MOCK_E2E_CHANGES: E2EChangeItem[] = [
  {
    id: 'change-e2e-001',
    scheduleId: 'sched-e2e-001',
    scheduleName: 'ThinkPad T14 Weekly Price Monitor',
    runId: 'run-e2e-live-001',
    entityType: 'ATTRIBUTE',
    changeType: 'PRICE_DROP',
    severity: 'SIGNIFICANT',
    title: 'Price decreased by $50.00 (-7.1%)',
    description: 'eBay Refurbished price reduced from $699.99 to $649.99',
    previousValue: '$699.99',
    currentValue: '$649.99',
    detectedAt: '2026-11-03T14:01:10Z',
    candidateName: 'Lenovo ThinkPad T14 Gen 3 AMD Ryzen 7',
  },
  {
    id: 'change-e2e-002',
    scheduleId: 'sched-e2e-001',
    scheduleName: 'ThinkPad T14 Weekly Price Monitor',
    runId: 'run-e2e-live-001',
    entityType: 'ATTRIBUTE',
    changeType: 'STOCK_STATUS_CHANGED',
    severity: 'NOTABLE',
    title: 'In Stock status confirmed',
    description: 'Condition Grade A verified available from certified retailer',
    previousValue: 'LOW_STOCK',
    currentValue: 'IN_STOCK',
    detectedAt: '2026-11-03T14:01:12Z',
    candidateName: 'Lenovo ThinkPad T14 Gen 3 AMD Ryzen 7',
  },
];

// ---------------------------------------------------------------------------
// Notification Mock Fixtures
// ---------------------------------------------------------------------------
export const MOCK_E2E_NOTIFICATIONS: E2ENotification[] = [
  {
    id: 'notif-e2e-001',
    user_id: 'usr-e2e-001',
    research_run_id: 'run-e2e-live-001',
    schedule_id: 'sched-e2e-001',
    change_event_id: 'change-e2e-001',
    notification_type: 'PRICE_DROP',
    severity: 'SIGNIFICANT',
    title: 'ThinkPad T14 Price Drop to $649.99',
    summary: 'The target Lenovo ThinkPad T14 Gen 3 price dropped $50.00 below your ceiling constraint.',
    read_at: null,
    dismissed_at: null,
    created_at: '2026-11-07T08:02:00Z',
  },
  {
    id: 'notif-e2e-002',
    user_id: 'usr-e2e-001',
    research_run_id: 'run-e2e-live-001',
    schedule_id: 'sched-e2e-001',
    change_event_id: 'change-e2e-002',
    notification_type: 'STOCK_STATUS_CHANGED',
    severity: 'NOTABLE',
    title: 'Stock Status Verified Available',
    summary: 'Certified Refurbished Grade A inventory is currently active at eBay Direct.',
    read_at: null,
    dismissed_at: null,
    created_at: '2026-11-07T08:02:05Z',
  },
];

// ---------------------------------------------------------------------------
// Provider Settings Mock Fixtures
// ---------------------------------------------------------------------------
export const MOCK_E2E_PROVIDERS: E2EProviderSettings[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Industry-standard frontier models including GPT-4o.',
    category: 'Primary AI Model',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-proj-...',
    helpText: 'Generate a secret key from your OpenAI dashboard.',
    isConfigured: true,
    isEnabled: true,
    credentialPreview: 'sk-proj-****8492',
    lastConnectionTestStatus: 'TEST_SUCCESS',
    lastConnectionTestAt: '2026-11-07T07:30:00Z',
    selectedModelId: 'gpt-4o',
    updatedAt: '2026-11-07T07:30:00Z',
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
];
