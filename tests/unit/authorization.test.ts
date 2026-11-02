import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuthenticatedCaller,
  assertResourceOwnership,
  assertParentChildOwnership,
  AuthenticationRequiredError,
  AuthorizationForbiddenError,
  ResourceNotFoundError,
  withAuthorizedScope,
  withAuthorizedDatabaseScope,
} from '@/server/auth/authorization';
import * as sessionModule from '@/server/auth/session';
import * as transactionModule from '@/server/persistence/transaction';

describe('Centralized Authorization Engine (Step 24 / SEC-008, SEC-010)', () => {
  const userA = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    email: 'userA@verityscout.local',
    displayName: 'User A',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const userB = {
    id: 'b1ffcd88-8d1c-3fe7-aa5c-5aa8ac270b22',
    email: 'userB@verityscout.local',
    displayName: 'User B',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireAuthenticatedCaller', () => {
    it('AUTHZ-001: Returns authorized context when valid session is resolved', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);

      const ctx = await requireAuthenticatedCaller();

      expect(ctx.userId).toBe(userA.id);
      expect(ctx.user.email).toBe(userA.email);
    });

    it('AUTHZ-002: Throws AuthenticationRequiredError (401) when unauthenticated or session expired', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(null);

      await expect(requireAuthenticatedCaller()).rejects.toThrow(AuthenticationRequiredError);
      await expect(requireAuthenticatedCaller()).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        statusCode: 401,
      });
    });
  });

  describe('assertResourceOwnership', () => {
    it('AUTHZ-003: Permits access when resource owner matches caller identity', () => {
      expect(() => {
        assertResourceOwnership(userA.id, userA.id, 'ResearchTask');
      }).not.toThrow();
    });

    it('AUTHZ-004: Fails closed with 404 Not Found by default to prevent resource ID enumeration', () => {
      expect(() => {
        assertResourceOwnership(userA.id, userB.id, 'ResearchTask');
      }).toThrow(ResourceNotFoundError);

      expect(() => {
        assertResourceOwnership(userA.id, userB.id, 'ResearchTask');
      }).toThrowError('ResearchTask not found');
    });

    it('AUTHZ-005: Throws 403 Forbidden when discloseForbidden is explicitly enabled', () => {
      expect(() => {
        assertResourceOwnership(userA.id, userB.id, 'ResearchTask', true);
      }).toThrow(AuthorizationForbiddenError);

      try {
        assertResourceOwnership(userA.id, userB.id, 'ResearchTask', true);
        expect.unreachable('Should have thrown AuthorizationForbiddenError');
      } catch (err: any) {
        expect(err.code).toBe('FORBIDDEN');
        expect(err.statusCode).toBe(403);
      }
    });

    it('AUTHZ-006: Rejects null or undefined resource owner safely', () => {
      expect(() => {
        assertResourceOwnership(null, userA.id, 'ResearchTask');
      }).toThrow(ResourceNotFoundError);

      expect(() => {
        assertResourceOwnership(undefined, userA.id, 'ResearchTask');
      }).toThrow(ResourceNotFoundError);
    });
  });

  describe('assertParentChildOwnership (Anti-ID Substitution)', () => {
    it('AUTHZ-007: Permits association when parent and child belong to same owner', () => {
      expect(() => {
        assertParentChildOwnership(userA.id, userA.id, 'Candidate-Evidence Link');
      }).not.toThrow();
    });

    it('AUTHZ-008: Blocks forged association between parent and child of different owners', () => {
      expect(() => {
        assertParentChildOwnership(userA.id, userB.id, 'Candidate-Evidence Link');
      }).toThrow(AuthorizationForbiddenError);

      expect(() => {
        assertParentChildOwnership(userA.id, userB.id, 'Candidate-Evidence Link');
      }).toThrowError(/parent and child resources belong to different owners/i);
    });
  });

  describe('withAuthorizedScope & withAuthorizedDatabaseScope', () => {
    it('AUTHZ-009: withAuthorizedScope passes authenticated caller context to callback', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);

      const result = await withAuthorizedScope(async (ctx) => {
        return `Hello ${ctx.user.displayName} (${ctx.userId})`;
      });

      expect(result).toBe(`Hello User A (${userA.id})`);
    });

    it('AUTHZ-010: withAuthorizedDatabaseScope propagates user identity to database RLS transaction context', async () => {
      vi.spyOn(sessionModule, 'getCurrentUser').mockResolvedValue(userA);
      const withUserContextSpy = vi.spyOn(transactionModule, 'withUserContext').mockImplementation(
        async (_userId, callback) => {
          const fakeTx = { query: vi.fn(), client: {} as any };
          return callback(fakeTx);
        }
      );

      const result = await withAuthorizedDatabaseScope(async (ctx, tx) => {
        return { userId: ctx.userId, txActive: Boolean(tx) };
      });

      expect(result.userId).toBe(userA.id);
      expect(result.txActive).toBe(true);
      expect(withUserContextSpy).toHaveBeenCalledWith(userA.id, expect.any(Function));
    });
  });
});
