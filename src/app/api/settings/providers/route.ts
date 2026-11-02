import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import {
  SUPPORTED_AI_PROVIDERS,
  BASELINE_AI_PROVIDER_DEFINITIONS,
  ProviderSettingsItemDTO,
  isSupportedAiProvider,
  ConnectionTestStatus,
} from '@/features/providers/types';
import { logger } from '@/lib/logging/logger';

const configRepo = new ProviderConfigRepository();
const credentialService = new ProviderCredentialService();

/**
 * GET /api/settings/providers
 * Returns all supported AI provider configurations for the authenticated caller.
 */
export async function GET(): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const userConfigs = await configRepo.listByOwner(userId);
    const configMap = new Map(userConfigs.map((cfg) => [cfg.provider_id, cfg]));

    const providers: ProviderSettingsItemDTO[] = SUPPORTED_AI_PROVIDERS.map((providerId) => {
      const def = BASELINE_AI_PROVIDER_DEFINITIONS[providerId];
      const saved = configMap.get(providerId);

      return {
        id: providerId,
        name: def.name,
        description: def.description,
        category: def.category,
        docsUrl: def.docsUrl,
        keyPlaceholder: def.keyPlaceholder,
        helpText: def.helpText,
        isConfigured: saved ? saved.has_credential : false,
        isEnabled: saved ? saved.is_enabled : true,
        credentialPreview: saved?.credential_preview ?? null,
        lastConnectionTestStatus: (saved?.last_connection_test_status as ConnectionTestStatus) ?? 'UNTESTED',
        lastConnectionTestAt: saved?.last_connection_test_at ?? null,
        selectedModelId: saved?.selected_model_id ?? null,
        updatedAt: saved?.updated_at ?? null,
      };
    });

    return NextResponse.json({ providers }, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDERS_GET_FAILED', 'Failed to retrieve provider settings', {
      callerUserId: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to retrieve provider configurations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/providers
 * Upserts a provider configuration and securely encrypts/saves credentials if provided.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request payload' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const { providerId, apiKey, isEnabled, selectedModelId } = body as Record<string, unknown>;

  if (typeof providerId !== 'string' || !isSupportedAiProvider(providerId)) {
    return NextResponse.json(
      { error: `Invalid or unsupported providerId. Supported: ${SUPPORTED_AI_PROVIDERS.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    let credentialPreview: string | null = null;
    let hasCredential: boolean | undefined = undefined;

    // 1. If an API key is provided, encrypt and store securely in the vault
    if (apiKey !== undefined && apiKey !== null) {
      if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        return NextResponse.json(
          { error: 'API key cannot be empty if specified' },
          { status: 400 }
        );
      }
      if (apiKey.length > 1024) {
        return NextResponse.json(
          { error: 'API key exceeds maximum length of 1024 characters' },
          { status: 400 }
        );
      }

      const meta = await credentialService.storeCredential(userId, providerId, apiKey);
      credentialPreview = meta.credentialPreview;
      hasCredential = true;
    }

    // 2. Upsert non-secret configuration metadata
    const updatedRow = await configRepo.upsertConfig({
      userId,
      providerId,
      ...(typeof isEnabled === 'boolean' ? { isEnabled } : {}),
      ...(typeof selectedModelId === 'string' ? { selectedModelId } : {}),
      ...(hasCredential !== undefined ? { hasCredential } : {}),
      ...(credentialPreview ? { credentialPreview } : {}),
    });

    const def = BASELINE_AI_PROVIDER_DEFINITIONS[providerId];
    const item: ProviderSettingsItemDTO = {
      id: providerId,
      name: def.name,
      description: def.description,
      category: def.category,
      docsUrl: def.docsUrl,
      keyPlaceholder: def.keyPlaceholder,
      helpText: def.helpText,
      isConfigured: updatedRow.has_credential,
      isEnabled: updatedRow.is_enabled,
      credentialPreview: updatedRow.credential_preview,
      lastConnectionTestStatus: (updatedRow.last_connection_test_status as ConnectionTestStatus) ?? 'UNTESTED',
      lastConnectionTestAt: updatedRow.last_connection_test_at,
      selectedModelId: updatedRow.selected_model_id,
      updatedAt: updatedRow.updated_at,
    };

    return NextResponse.json({ provider: item }, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDER_SAVE_FAILED', 'Failed to save provider configuration', {
      callerUserId: userId,
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to save provider configuration' },
      { status: 500 }
    );
  }
}
