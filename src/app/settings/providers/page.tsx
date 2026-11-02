import type { Metadata } from 'next';
import styles from './page.module.css';
import { Badge } from '@/components/ui';
import { ProviderSettingsManager } from '@/components/providers/ProviderSettingsManager';

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
          <Badge variant="brand">AES-256-GCM Encrypted</Badge>
        </div>
        <p className={styles.subtitle}>
          Configure and test credentials for supported frontier AI providers (OpenAI, OpenRouter, NVIDIA NIM).
          API keys are encrypted at rest in your secure personal vault and are never returned in plaintext.
        </p>
      </header>

      <ProviderSettingsManager />
    </div>
  );
}
