'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from './ProviderSettingsManager.module.css';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  Alert,
  Dialog,
  Input,
  FormField,
  LoadingSpinner,
} from '@/components/ui';
import {
  ProviderSettingsItemDTO,
  ConnectionTestStatus,
  ConnectionTestResponseDTO,
} from '@/features/providers/types';

interface ActionNotice {
  text: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
}

interface TestOutcomeState {
  success: boolean;
  message: string;
  durationMs?: number;
}

export function ProviderSettingsManager(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderSettingsItemDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null);

  // Configure/Replace Dialog State
  const [activeConfigProvider, setActiveConfigProvider] = useState<ProviderSettingsItemDTO | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete Confirmation Dialog State
  const [deletingProvider, setDeletingProvider] = useState<ProviderSettingsItemDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Connection Testing State
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testOutcomes, setTestOutcomes] = useState<Record<string, TestOutcomeState>>({});

  const loadProviders = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch('/api/settings/providers');
      if (!res.ok) {
        if (res.status === 401) {
          setFetchError('Please sign in to manage your AI provider configurations.');
          return;
        }
        throw new Error(`Failed to load providers (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (Array.isArray(data.providers)) {
        setProviders(data.providers);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to retrieve provider configurations');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const handleOpenConfigDialog = (provider: ProviderSettingsItemDTO) => {
    setActiveConfigProvider(provider);
    setApiKeyInput('');
    setSaveError(null);
  };

  const handleCloseConfigDialog = () => {
    if (isSaving) return;
    setActiveConfigProvider(null);
    setApiKeyInput('');
    setSaveError(null);
  };

  const handleSaveCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConfigProvider) return;

    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      setSaveError('Please enter a valid API key');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: activeConfigProvider.id,
          apiKey: trimmedKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save credential');
      }

      const updatedProvider = data.provider as ProviderSettingsItemDTO;

      // Update provider in local list
      setProviders((prev) =>
        prev.map((p) => (p.id === updatedProvider.id ? updatedProvider : p))
      );

      // Invalidate any previous connection test result since a new key was saved
      setTestOutcomes((prev) => {
        const next = { ...prev };
        delete next[updatedProvider.id];
        return next;
      });

      setActionNotice({
        text: `${updatedProvider.name} API credential securely encrypted with AES-256-GCM and saved.`,
        variant: 'success',
      });

      // Clear input and close modal
      setApiKeyInput('');
      setActiveConfigProvider(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error encrypting and persisting credential');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (provider: ProviderSettingsItemDTO) => {
    const newEnabledState = !provider.isEnabled;

    // Optimistic UI update
    setProviders((prev) =>
      prev.map((p) => (p.id === provider.id ? { ...p, isEnabled: newEnabledState } : p))
    );

    try {
      const res = await fetch(`/api/settings/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: newEnabledState }),
      });

      if (!res.ok) {
        throw new Error('Failed to update provider status');
      }

      const data = await res.json();
      setProviders((prev) =>
        prev.map((p) => (p.id === provider.id ? (data.provider as ProviderSettingsItemDTO) : p))
      );
    } catch {
      // Revert on failure
      setProviders((prev) =>
        prev.map((p) => (p.id === provider.id ? { ...p, isEnabled: !newEnabledState } : p))
      );
      setActionNotice({
        text: `Failed to update status for ${provider.name}.`,
        variant: 'danger',
      });
    }
  };

  const handleTestConnection = async (provider: ProviderSettingsItemDTO) => {
    if (testingProviderId || !provider.isConfigured) return;

    setTestingProviderId(provider.id);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/settings/providers/${provider.id}/test`, {
        method: 'POST',
      });

      const outcome = (await res.json()) as ConnectionTestResponseDTO;

      const newStatus: ConnectionTestStatus = outcome.success ? 'SUCCESS' : 'FAILED';
      const testedAt = outcome.testedAt || new Date().toISOString();

      // Update provider row with latest test status
      setProviders((prev) =>
        prev.map((p) =>
          p.id === provider.id
            ? { ...p, lastConnectionTestStatus: newStatus, lastConnectionTestAt: testedAt }
            : p
        )
      );

      setTestOutcomes((prev) => ({
        ...prev,
        [provider.id]: {
          success: outcome.success,
          message: outcome.message,
          durationMs: outcome.durationMs,
        },
      }));

      setActionNotice({
        text: outcome.success
          ? `${provider.name} connection test verified (${outcome.durationMs}ms).`
          : `${provider.name} connection test failed: ${outcome.message}`,
        variant: outcome.success ? 'success' : 'danger',
      });
    } catch (err) {
      setTestOutcomes((prev) => ({
        ...prev,
        [provider.id]: {
          success: false,
          message: err instanceof Error ? err.message : 'Network failure during test probe',
        },
      }));
      setActionNotice({
        text: `Network failure testing ${provider.name}.`,
        variant: 'danger',
      });
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProvider) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/settings/providers/${deletingProvider.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete provider configuration');
      }

      setProviders((prev) =>
        prev.map((p) =>
          p.id === deletingProvider.id
            ? {
                ...p,
                isConfigured: false,
                credentialPreview: null,
                lastConnectionTestStatus: 'UNTESTED',
                lastConnectionTestAt: null,
              }
            : p
        )
      );

      setTestOutcomes((prev) => {
        const next = { ...prev };
        delete next[deletingProvider.id];
        return next;
      });

      setActionNotice({
        text: `${deletingProvider.name} configuration and encrypted secret removed from vault.`,
        variant: 'info',
      });
      setDeletingProvider(null);
    } catch (err) {
      setActionNotice({
        text: err instanceof Error ? err.message : 'Failed to delete configuration',
        variant: 'danger',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.centerSpinner} aria-live="polite">
        <LoadingSpinner size="lg" label="Loading AI provider configurations..." />
        <span>Loading AI provider configurations...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className={styles.container}>
        <Alert variant="danger" title="Configuration Unavailable">
          {fetchError}
        </Alert>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {actionNotice && (
        <div className={styles.noticeArea} aria-live="polite">
          <Alert
            variant={actionNotice.variant}
            {...(actionNotice.variant === 'success' ? { title: 'Settings Updated' } : {})}
          >
            {actionNotice.text}
          </Alert>
        </div>
      )}

      <div className={styles.cardsGrid}>
        {providers.map((provider) => {
          const outcome = testOutcomes[provider.id];
          const isCurrentlyTesting = testingProviderId === provider.id;

          let statusBadgeVariant: 'neutral' | 'brand' | 'success' | 'danger' = 'neutral';
          let statusBadgeText = 'Not Configured';

          if (isCurrentlyTesting) {
            statusBadgeVariant = 'brand';
            statusBadgeText = 'Testing Connection...';
          } else if (provider.isConfigured) {
            if (provider.lastConnectionTestStatus === 'SUCCESS') {
              statusBadgeVariant = 'success';
              statusBadgeText = 'Connection Verified';
            } else if (provider.lastConnectionTestStatus === 'FAILED') {
              statusBadgeVariant = 'danger';
              statusBadgeText = 'Connection Test Failed';
            } else {
              statusBadgeVariant = 'brand';
              statusBadgeText = 'Configured (Untested)';
            }
          }

          return (
            <Card key={provider.id} variant="default" className={styles.cardWrapper}>
              <CardHeader>
                <div className={styles.headerRow}>
                  <span className={styles.categoryTag}>{provider.category}</span>
                  <div className={styles.statusBadges}>
                    <Badge variant={statusBadgeVariant} size="sm">
                      {statusBadgeText}
                    </Badge>
                  </div>
                </div>
                <CardTitle as="h2" className={styles.cardTitle}>
                  {provider.name}
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p className={styles.description}>{provider.description}</p>

                <div className={styles.metaSection}>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Credential Status:</span>
                    <span className={styles.metaValue}>
                      {provider.isConfigured
                        ? provider.credentialPreview || 'Credential Configured'
                        : 'None'}
                    </span>
                  </div>

                  {provider.isConfigured && provider.lastConnectionTestAt && (
                    <div className={styles.metaRow}>
                      <span className={styles.metaLabel}>Last Tested:</span>
                      <span className={styles.metaValue}>
                        {new Date(provider.lastConnectionTestAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  )}

                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Provider Portal:</span>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.docsLink}
                      aria-label={`Get API key from ${provider.name} (opens in new tab)`}
                    >
                      Get API Key ↗
                    </a>
                  </div>
                </div>

                {outcome && (
                  <div className={styles.testResultBanner} aria-live="polite">
                    <Alert
                      variant={outcome.success ? 'success' : 'danger'}
                      title={outcome.success ? 'Probe Succeeded' : 'Probe Failed'}
                    >
                      {outcome.message}
                      {outcome.durationMs !== undefined && (
                        <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)' }}>
                          Latency: {outcome.durationMs}ms
                        </div>
                      )}
                    </Alert>
                  </div>
                )}

                <div className={styles.actionRow}>
                  <Button
                    variant={provider.isConfigured ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => handleOpenConfigDialog(provider)}
                    id={`btn-configure-${provider.id}`}
                  >
                    {provider.isConfigured ? 'Replace Key' : 'Configure Key'}
                  </Button>

                  {provider.isConfigured && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isCurrentlyTesting}
                        onClick={() => handleTestConnection(provider)}
                        id={`btn-test-${provider.id}`}
                        aria-label={`Test connection for ${provider.name}`}
                      >
                        {isCurrentlyTesting ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span>Testing...</span>
                          </>
                        ) : (
                          'Test Connection'
                        )}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingProvider(provider)}
                        id={`btn-remove-${provider.id}`}
                        aria-label={`Remove configuration for ${provider.name}`}
                      >
                        Remove
                      </Button>
                    </>
                  )}

                  {provider.isConfigured && (
                    <label className={styles.toggleContainer} htmlFor={`toggle-${provider.id}`}>
                      <input
                        id={`toggle-${provider.id}`}
                        type="checkbox"
                        checked={provider.isEnabled}
                        onChange={() => handleToggleEnabled(provider)}
                        className={styles.toggleInput}
                        aria-label={`Enable or disable ${provider.name}`}
                      />
                      <span>{provider.isEnabled ? 'Active' : 'Disabled'}</span>
                    </label>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Configure / Replace Key Dialog */}
      {activeConfigProvider && (
        <Dialog
          isOpen={Boolean(activeConfigProvider)}
          onClose={handleCloseConfigDialog}
          title={`Configure ${activeConfigProvider.name} Credential`}
          description={`Securely store or replace your API key for ${activeConfigProvider.name}.`}
          id="config-credential-dialog"
          footer={
            <div className={styles.dialogFooter}>
              <Button
                variant="ghost"
                onClick={handleCloseConfigDialog}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveCredential}
                disabled={isSaving || !apiKeyInput.trim()}
                id="btn-save-credential"
              >
                {isSaving ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Encrypting & Saving...</span>
                  </>
                ) : activeConfigProvider.isConfigured ? (
                  'Replace API Key'
                ) : (
                  'Save API Key'
                )}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleSaveCredential} className={styles.dialogForm}>
            {saveError && (
              <Alert variant="danger" title="Save Failed">
                {saveError}
              </Alert>
            )}

            <div className={styles.vaultSecurityBadge}>
              🔒 Protected by Hardware-Accelerated AES-256-GCM Vault Encryption
            </div>

            <p className={styles.dialogHelpText}>
              {activeConfigProvider.helpText} Your API key is encrypted on the server before storage
              and is never sent back to the browser in plaintext.
            </p>

            <FormField
              label={`${activeConfigProvider.name} API Key`}
              htmlFor="apiKeyInput"
              required
              description={`Format: ${activeConfigProvider.keyPlaceholder}`}
            >
              <Input
                type="password"
                id="apiKeyInput"
                name="apiKeyInput"
                autoComplete="off"
                placeholder={activeConfigProvider.keyPlaceholder}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                disabled={isSaving}
                autoFocus
              />
            </FormField>
          </form>
        </Dialog>
      )}

      {/* Remove Confirmation Dialog */}
      {deletingProvider && (
        <Dialog
          isOpen={Boolean(deletingProvider)}
          onClose={() => !isDeleting && setDeletingProvider(null)}
          title={`Remove ${deletingProvider.name} Configuration?`}
          description="This action will permanently delete your encrypted API key from the secure vault."
          id="delete-credential-dialog"
          footer={
            <div className={styles.dialogFooter}>
              <Button
                variant="ghost"
                onClick={() => setDeletingProvider(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                id="btn-confirm-delete"
              >
                {isDeleting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  'Permanently Remove'
                )}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Alert variant="warning" title="Irreversible Action">
              Removing this provider credential will disable research runs that depend on{' '}
              <strong>{deletingProvider.name}</strong>. Historical evidence and past research runs
              will not be deleted.
            </Alert>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Note: This action deletes the key stored in VerityScout AI; it does not revoke the API
              key in your provider&apos;s developer account.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
