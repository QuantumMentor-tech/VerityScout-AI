import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getProviders, POST as saveProvider } from '@/app/api/settings/providers/route';
import {
  GET as getSingleProvider,
  PATCH as updateProvider,
  DELETE as deleteProvider,
} from '@/app/api/settings/providers/[providerId]/route';
import { POST as testProviderRoute } from '@/app/api/settings/providers/[providerId]/test/route';
import * as sessionModule from '@/server/auth/session';
import { ProviderConfigRepository } from '@/server/persistence/repositories/provider-config.repository';
import { ProviderCredentialService } from '@/server/services/provider-credential.service';
import * as connectionTesterModule from '@/server/providers/connection-tester';

describe('AI Provider Settings API Route Handlers (Step 26 / SEC-008, SEC-011)', () => {
  const userA = {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'userA@verityscout.local',
    displayName: 'User A',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const userB = {
    id: '22222222-2222-4222-b222-222222222222',
    email: 'userB@verityscout.local',
    displayName: 'User B',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. GET /api/settings/providers', () => {
    it('API-PROV-001: Returns 401 Unauthorized when no active session exists', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(null);

      const res = await getProviders();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Authentication required');
    });

    it('API-PROV-002: Returns safe metadata for all 3 baseline providers for authenticated user', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      vi.spyOn(ProviderConfigRepository.prototype, 'listByOwner').mockResolvedValue([
        {
          id: 'cfg-1',
          user_id: userA.id,
          provider_id: 'openai',
          is_enabled: true,
          selected_model_id: null,
          custom_base_url: null,
          has_credential: true,
          credential_preview: 'sk-...4321',
          last_connection_test_at: '2026-11-02T08:00:00.000Z',
          last_connection_test_status: 'SUCCESS',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T08:00:00.000Z',
        },
      ]);

      const res = await getProviders();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.providers).toHaveLength(3);

      const openai = body.providers.find((p: { id: string }) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai.isConfigured).toBe(true);
      expect(openai.credentialPreview).toBe('sk-...4321');
      expect(openai.lastConnectionTestStatus).toBe('SUCCESS');
      // Plaintext key MUST never be exposed
      expect(openai.apiKey).toBeUndefined();

      const openrouter = body.providers.find((p: { id: string }) => p.id === 'openrouter');
      expect(openrouter).toBeDefined();
      expect(openrouter.isConfigured).toBe(false);
      expect(openrouter.lastConnectionTestStatus).toBe('UNTESTED');
    });
  });

  describe('2. POST /api/settings/providers (Credential Save / Replace)', () => {
    it('API-PROV-003: Rejects unauthenticated request with 401', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/settings/providers', {
        method: 'POST',
        body: JSON.stringify({ providerId: 'openai', apiKey: 'sk-proj-test1234' }),
      });

      const res = await saveProvider(req);
      expect(res.status).toBe(401);
    });

    it('API-PROV-004: Rejects invalid or unsupported providerId with 400', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);

      const req = new NextRequest('http://localhost:3000/api/settings/providers', {
        method: 'POST',
        body: JSON.stringify({ providerId: 'unsupported_model', apiKey: 'test' }),
      });

      const res = await saveProvider(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Invalid or unsupported providerId');
    });

    it('API-PROV-005: Encrypts and saves API key, returning only safe metadata without secret key', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      const storeSpy = vi.spyOn(ProviderCredentialService.prototype, 'storeCredential').mockResolvedValue({
        providerId: 'openai',
        hasCredential: true,
        credentialPreview: 'sk-...7890',
        keyVersion: 1,
      });

      vi.spyOn(ProviderConfigRepository.prototype, 'upsertConfig').mockResolvedValue({
        id: 'cfg-1',
        user_id: userA.id,
        provider_id: 'openai',
        is_enabled: true,
        selected_model_id: null,
        custom_base_url: null,
        has_credential: true,
        credential_preview: 'sk-...7890',
        last_connection_test_at: null,
        last_connection_test_status: 'UNTESTED',
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-02T08:00:00.000Z',
      });

      const rawCanaryKey = 'sk-proj-canary-secret-1234567890';
      const req = new NextRequest('http://localhost:3000/api/settings/providers', {
        method: 'POST',
        body: JSON.stringify({ providerId: 'openai', apiKey: rawCanaryKey }),
      });

      const res = await saveProvider(req);
      expect(res.status).toBe(200);

      expect(storeSpy).toHaveBeenCalledWith(userA.id, 'openai', rawCanaryKey);

      const body = await res.json();
      expect(body.provider.isConfigured).toBe(true);
      expect(body.provider.credentialPreview).toBe('sk-...7890');
      // Critical check: canary secret must never appear in response
      expect(JSON.stringify(body)).not.toContain(rawCanaryKey);
    });
  });

  describe('3. GET, PATCH, and DELETE /api/settings/providers/[providerId]', () => {
    it('API-PROV-006: Returns 404 for unknown providerId', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);

      const req = new NextRequest('http://localhost:3000/api/settings/providers/unknown_llm');
      const res = await getSingleProvider(req, {
        params: Promise.resolve({ providerId: 'unknown_llm' }),
      });

      expect(res.status).toBe(404);
    });

    it('API-PROV-007: Updates non-secret metadata (isEnabled) via PATCH', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      const upsertSpy = vi.spyOn(ProviderConfigRepository.prototype, 'upsertConfig').mockResolvedValue({
        id: 'cfg-1',
        user_id: userA.id,
        provider_id: 'nim',
        is_enabled: false,
        selected_model_id: null,
        custom_base_url: null,
        has_credential: true,
        credential_preview: 'nv...9999',
        last_connection_test_at: null,
        last_connection_test_status: 'UNTESTED',
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-02T08:00:00.000Z',
      });

      const req = new NextRequest('http://localhost:3000/api/settings/providers/nim', {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: false }),
      });

      const res = await updateProvider(req, {
        params: Promise.resolve({ providerId: 'nim' }),
      });

      expect(res.status).toBe(200);
      expect(upsertSpy).toHaveBeenCalledWith({
        userId: userA.id,
        providerId: 'nim',
        isEnabled: false,
      });

      const body = await res.json();
      expect(body.provider.isEnabled).toBe(false);
    });

    it('API-PROV-008: Deletes credential from vault and deletes configuration via DELETE', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      const deleteVaultSpy = vi.spyOn(ProviderCredentialService.prototype, 'deleteCredential').mockResolvedValue(true);
      const deleteConfigSpy = vi.spyOn(ProviderConfigRepository.prototype, 'deleteByProvider').mockResolvedValue(true);

      const req = new NextRequest('http://localhost:3000/api/settings/providers/openai', {
        method: 'DELETE',
      });

      const res = await deleteProvider(req, {
        params: Promise.resolve({ providerId: 'openai' }),
      });

      expect(res.status).toBe(200);
      expect(deleteVaultSpy).toHaveBeenCalledWith(userA.id, 'openai');
      expect(deleteConfigSpy).toHaveBeenCalledWith(userA.id, 'openai');

      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('4. POST /api/settings/providers/[providerId]/test (Connection Testing)', () => {
    it('API-PROV-009: Triggers connection test probe and returns normalized outcome', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      const probeSpy = vi.spyOn(connectionTesterModule, 'testProviderConnection').mockResolvedValue({
        success: true,
        code: 'SUCCESS',
        message: 'Connection verified',
        testedAt: '2026-11-02T08:05:00.000Z',
        durationMs: 142,
      });

      const req = new NextRequest('http://localhost:3000/api/settings/providers/openrouter/test', {
        method: 'POST',
      });

      const res = await testProviderRoute(req, {
        params: Promise.resolve({ providerId: 'openrouter' }),
      });

      expect(res.status).toBe(200);
      expect(probeSpy).toHaveBeenCalledWith(userA.id, 'openrouter');

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.code).toBe('SUCCESS');
      expect(body.durationMs).toBe(142);
    });

    it('API-PROV-010: Enforces Tenant Isolation: User B cannot test or access User A credentials', async () => {
      // Caller is authenticated as User B
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userB);

      const probeSpy = vi.spyOn(connectionTesterModule, 'testProviderConnection').mockResolvedValue({
        success: false,
        code: 'AUTH_FAILED',
        message: 'No API credential configured for this provider.',
        testedAt: '2026-11-02T08:05:00.000Z',
        durationMs: 10,
      });

      const req = new NextRequest('http://localhost:3000/api/settings/providers/openai/test', {
        method: 'POST',
      });

      const res = await testProviderRoute(req, {
        params: Promise.resolve({ providerId: 'openai' }),
      });

      expect(res.status).toBe(200);
      // Strictly passes userB.id to the tester, never userA.id
      expect(probeSpy).toHaveBeenCalledWith(userB.id, 'openai');
      expect(probeSpy).not.toHaveBeenCalledWith(userA.id, 'openai');
    });
  });
});
