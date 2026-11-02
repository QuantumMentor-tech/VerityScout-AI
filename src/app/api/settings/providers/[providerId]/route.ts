import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedCaller } from '@/server/auth/authorization';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import {
  BASELINE_AI_PROVIDER_DEFINITIONS,
  ProviderSettingsItemDTO,
  isSupportedAiProvider,
  ConnectionTestStatus,
} from '@/features/providers/types';
import { logger } from '@/lib/logging/logger';

const configRepo = new ProviderConfigRepository();
const credentialService = new ProviderCredentialService();

interface RouteContext {
  params: Promise<{
    providerId: string;
  }>;
}

/**
 * GET /api/settings/providers/[providerId]
 * Returns configuration metadata for a specific provider.
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { providerId } = await context.params;

  if (!isSupportedAiProvider(providerId)) {
    return NextResponse.json({ error: `Unsupported provider: ${providerId}` }, { status: 404 });
  }

  try {
    const saved = await configRepo.findByProvider(userId, providerId);
    const def = BASELINE_AI_PROVIDER_DEFINITIONS[providerId];

    const provider: ProviderSettingsItemDTO = {
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

    return NextResponse.json({ provider }, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDER_GET_FAILED', 'Failed to retrieve provider configuration', {
      callerUserId: userId,
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to retrieve configuration' }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/providers/[providerId]
 * Updates permitted non-secret fields (e.g., isEnabled, selectedModelId).
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { providerId } = await context.params;

  if (!isSupportedAiProvider(providerId)) {
    return NextResponse.json({ error: `Unsupported provider: ${providerId}` }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const { isEnabled, selectedModelId } = body as Record<string, unknown>;

  try {
    const updated = await configRepo.upsertConfig({
      userId,
      providerId,
      ...(typeof isEnabled === 'boolean' ? { isEnabled } : {}),
      ...(typeof selectedModelId === 'string' ? { selectedModelId } : {}),
    });

    const def = BASELINE_AI_PROVIDER_DEFINITIONS[providerId];
    const provider: ProviderSettingsItemDTO = {
      id: providerId,
      name: def.name,
      description: def.description,
      category: def.category,
      docsUrl: def.docsUrl,
      keyPlaceholder: def.keyPlaceholder,
      helpText: def.helpText,
      isConfigured: updated.has_credential,
      isEnabled: updated.is_enabled,
      credentialPreview: updated.credential_preview,
      lastConnectionTestStatus: (updated.last_connection_test_status as ConnectionTestStatus) ?? 'UNTESTED',
      lastConnectionTestAt: updated.last_connection_test_at,
      selectedModelId: updated.selected_model_id,
      updatedAt: updated.updated_at,
    };

    return NextResponse.json({ provider }, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDER_PATCH_FAILED', 'Failed to update provider configuration', {
      callerUserId: userId,
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/providers/[providerId]
 * Deletes configuration and removes stored credential from vault.
 */
export async function DELETE(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  let userId: string;
  try {
    const authContext = await requireAuthenticatedCaller();
    userId = authContext.userId;
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { providerId } = await context.params;

  if (!isSupportedAiProvider(providerId)) {
    return NextResponse.json({ error: `Unsupported provider: ${providerId}` }, { status: 404 });
  }

  try {
    // 1. Delete vault secret
    await credentialService.deleteCredential(userId, providerId);

    // 2. Delete configuration metadata
    await configRepo.deleteByProvider(userId, providerId);

    logger.info('SETTINGS_PROVIDER_DELETED', 'Provider configuration and vault secret deleted', {
      callerUserId: userId,
      providerId,
    });

    return NextResponse.json({ success: true, providerId }, { status: 200 });
  } catch (error) {
    logger.error('SETTINGS_PROVIDER_DELETE_FAILED', 'Failed to delete provider configuration', {
      callerUserId: userId,
      providerId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to delete provider configuration' }, { status: 500 });
  }
}
