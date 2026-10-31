import type { Metadata } from 'next';
import styles from './page.module.css';
import { Alert, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { PROVIDERS_FIXTURE } from '@/fixtures';

export const metadata: Metadata = {
  title: 'Provider Settings — VerityScout AI',
  description: 'AI model orchestration, multi-provider credential management, and discovery adapter settings.',
};

export default function ProviderSettingsPage(): React.JSX.Element {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h1 className={styles.title}>Provider Settings</h1>
          <Badge variant="brand">Step 15 Shell</Badge>
        </div>
        <p className={styles.subtitle}>
          Multi-provider orchestration (OpenAI, OpenRouter, NVIDIA NIM) and search discovery credentials.
        </p>
      </header>

      <Alert variant="warning" title="Configuration Preview — Functionality Deferred">
        Provider credential storage, BYOK vault encryption (AES-256-GCM), and model connection testing are scheduled 
        for Phase 5 (Step 29+) and Phase 8 (Step 46+). No real API keys or sensitive credentials can be configured or stored on this page.
      </Alert>

      <div className={styles.providerGrid}>
        {PROVIDERS_FIXTURE.map((provider) => (
          <Card key={provider.id} variant="default">
            <CardHeader>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <span className={styles.categoryTag}>{provider.category}</span>
                <Badge variant="neutral" size="sm">{provider.status}</Badge>
              </div>
              <CardTitle as="h2">{provider.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 'var(--line-height-normal)' }}>
                {provider.description}
              </p>

              <div style={{ marginTop: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-muted)' }}>
                  Catalog Models:
                </span>
                <div className={styles.modelsList}>
                  {provider.supportedModels.map((model) => (
                    <span key={model} className={styles.modelBadge}>
                      {model}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
