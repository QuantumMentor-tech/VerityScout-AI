import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ProviderSettingsManager } from '@/components/providers/ProviderSettingsManager';
import { ProviderSettingsItemDTO } from '@/features/providers/types';

describe('ProviderSettingsManager UI Component (Step 26 / AC-05, AC-06, AC-07)', () => {
  const mockProviders: ProviderSettingsItemDTO[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      description: 'Industry-standard frontier models including GPT-4o.',
      category: 'Primary AI Model',
      docsUrl: 'https://platform.openai.com/api-keys',
      keyPlaceholder: 'sk-proj-...',
      helpText: 'Generate a secret key from your OpenAI dashboard.',
      isConfigured: false,
      isEnabled: true,
      credentialPreview: null,
      lastConnectionTestStatus: 'UNTESTED',
      lastConnectionTestAt: null,
      selectedModelId: null,
      updatedAt: null,
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      description: 'Unified multi-provider gateway supporting open weights.',
      category: 'Multi-Model Router',
      docsUrl: 'https://openrouter.ai/keys',
      keyPlaceholder: 'sk-or-v1-...',
      helpText: 'Obtain an API key from OpenRouter settings.',
      isConfigured: true,
      isEnabled: true,
      credentialPreview: 'sk-...4321',
      lastConnectionTestStatus: 'SUCCESS',
      lastConnectionTestAt: '2026-11-02T08:00:00.000Z',
      selectedModelId: null,
      updatedAt: '2026-11-02T08:00:00.000Z',
    },
    {
      id: 'nim',
      name: 'NVIDIA NIM',
      description: 'Hardware-accelerated inference microservices.',
      category: 'High-Performance Inference',
      docsUrl: 'https://build.nvidia.com',
      keyPlaceholder: 'nvapi-...',
      helpText: 'Generate an API key from NVIDIA Build platform.',
      isConfigured: true,
      isEnabled: true,
      credentialPreview: 'nv...9999',
      lastConnectionTestStatus: 'FAILED',
      lastConnectionTestAt: '2026-11-02T08:10:00.000Z',
      selectedModelId: null,
      updatedAt: '2026-11-02T08:10:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UI-PROV-001: Renders all 3 baseline providers with truthful status badges', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/settings/providers') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ providers: mockProviders }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(<ProviderSettingsManager />);

    // Initially shows loading state
    expect(screen.getByRole('status')).toBeInTheDocument();

    // After loading, headers appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /openai/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /openrouter/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: /nvidia nim/i })).toBeInTheDocument();
    });

    // Check status badges
    expect(screen.getByText('Not Configured')).toBeInTheDocument();
    expect(screen.getByText('Connection Verified')).toBeInTheDocument();
    expect(screen.getByText('Connection Test Failed')).toBeInTheDocument();

    // Credential previews
    expect(screen.getByText('sk-...4321')).toBeInTheDocument();
    expect(screen.getByText('nv...9999')).toBeInTheDocument();
  });

  it('UI-PROV-002: Opens configuration dialog and saves new API key securely', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/settings/providers' && (!init || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ providers: mockProviders }),
        } as Response;
      }

      if (url === '/api/settings/providers' && init?.method === 'POST') {
        const updated: ProviderSettingsItemDTO = {
          ...mockProviders[0]!,
          isConfigured: true,
          credentialPreview: 'sk-...9999',
          lastConnectionTestStatus: 'UNTESTED',
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ provider: updated }),
        } as Response;
      }

      return { ok: false, status: 404 } as Response;
    });

    render(<ProviderSettingsManager />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /openai/i })).toBeInTheDocument();
    });

    // Click "Configure Key" button on OpenAI card
    const configureBtn = screen.getByRole('button', { name: /configure key/i });
    fireEvent.click(configureBtn);

    // Dialog appears with password input
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/openai api key/i)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/openai api key/i);
    expect(input).toHaveAttribute('type', 'password');

    // Type API key
    fireEvent.change(input, { target: { value: 'sk-proj-test-new-key-12345' } });

    // Click Save button
    const saveBtn = screen.getByRole('button', { name: /save api key/i });
    fireEvent.click(saveBtn);

    // Verify dialog closes and notice appears
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText(/api credential securely encrypted with aes-256-gcm and saved/i)).toBeInTheDocument();
    });
  });

  it('UI-PROV-003: Explicit connection test triggers probe and displays inline test outcome', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/settings/providers') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ providers: mockProviders }),
        } as Response;
      }

      if (url === '/api/settings/providers/openrouter/test' && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            code: 'SUCCESS',
            message: 'Connection verified via probe',
            testedAt: '2026-11-02T08:15:00.000Z',
            durationMs: 85,
          }),
        } as Response;
      }

      return { ok: false, status: 404 } as Response;
    });

    render(<ProviderSettingsManager />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /openrouter/i })).toBeInTheDocument();
    });

    // Click "Test Connection" on OpenRouter
    const testBtn = screen.getByRole('button', { name: /test connection for openrouter/i });
    fireEvent.click(testBtn);

    // Outcome appears inline on the card
    await waitFor(() => {
      expect(screen.getByText('Connection verified via probe')).toBeInTheDocument();
      expect(screen.getByText(/latency: 85ms/i)).toBeInTheDocument();
    });
  });

  it('UI-PROV-004: Remove configuration opens confirmation dialog and confirms deletion', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/settings/providers') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ providers: mockProviders }),
        } as Response;
      }

      if (url === '/api/settings/providers/openrouter' && init?.method === 'DELETE') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response;
      }

      return { ok: false, status: 404 } as Response;
    });

    render(<ProviderSettingsManager />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /openrouter/i })).toBeInTheDocument();
    });

    // Click "Remove" button
    const removeBtn = screen.getByRole('button', { name: /remove configuration for openrouter/i });
    fireEvent.click(removeBtn);

    // Confirmation dialog opens
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /remove openrouter configuration\?/i })).toBeInTheDocument();
    });

    // Confirm deletion
    const confirmBtn = screen.getByRole('button', { name: /permanently remove/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 2, name: /remove openrouter configuration\?/i })).not.toBeInTheDocument();
      expect(screen.getByText(/openrouter configuration and encrypted secret removed from vault/i)).toBeInTheDocument();
    });
  });
});
