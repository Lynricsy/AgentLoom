import * as crypto from 'node:crypto';

import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef, Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthGuard } from '../src/common/guards/auth.guard';
import { DomainException } from '../src/common/exceptions/domain.exception';
import { TokenBlacklistService } from '../src/common/services/token-blacklist.service';
import { AuthService } from '../src/modules/auth/auth.service';
import type { SupabaseService } from '../src/modules/auth/supabase/supabase.service';
import {
  createRlsTestContext,
  seedAppUser,
  type RlsTestContext,
} from './rls/rls-test-utils';

const JWT_SECRET = 'fixlab-session-revocation-secret';

// GoTrue auth.sessions 的最小子集：AuthService 的会话查询只用到这些列。
const AUTH_SESSIONS_DDL = `
  CREATE TABLE IF NOT EXISTS auth.sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    refreshed_at timestamptz,
    not_after timestamptz,
    user_agent text,
    ip inet
  )
`;

function signAccessToken(userId: string, sessionId: string) {
  return jwt.sign(
    {
      sub: userId,
      email: `${userId}@ex.com`,
      aud: 'authenticated',
      role: 'authenticated',
      session_id: sessionId,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

function createHttpContext(token: string) {
  const request = { headers: { authorization: `Bearer ${token}` } };
  return {
    request,
    context: {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

async function rejectionType(promise: Promise<unknown>) {
  try {
    await promise;
    return 'accepted';
  } catch (error) {
    return error instanceof DomainException ? error.type : String(error);
  }
}

describe('会话吊销使已签发的 access token 失效 (testcontainers)', () => {
  let context: RlsTestContext;
  let guard: AuthGuard;
  let authService: AuthService;
  let userId: string;
  let currentSessionId: string;
  let currentToken: string;

  beforeAll(async () => {
    context = await createRlsTestContext();
    await context.adminSql.unsafe(AUTH_SESSIONS_DDL);

    const blacklist = new TokenBlacklistService(context.db);
    const resolver = { resolveAppUserId: async (sub: string) => sub };
    guard = new AuthGuard(
      { getAllAndOverride: () => false } as unknown as Reflector,
      { get: () => JWT_SECRET } as unknown as ConfigService,
      blacklist,
      { get: () => resolver } as unknown as ModuleRef,
    );
    authService = new AuthService({} as SupabaseService, context.db, blacklist);
  }, 180_000);

  afterAll(async () => {
    await context?.close();
  });

  beforeEach(async () => {
    await context.adminSql`DELETE FROM auth.sessions`;
    await context.reset();

    userId = crypto.randomUUID();
    currentSessionId = crypto.randomUUID();
    await seedAppUser(context.adminSql, userId, `${userId}@ex.com`);
    await context.adminSql`
      INSERT INTO auth.sessions (id, user_id) VALUES (${currentSessionId}::uuid, ${userId}::uuid)
    `;
    currentToken = signAccessToken(userId, currentSessionId);
  });

  async function addSession() {
    const sessionId = crypto.randomUUID();
    await context.adminSql`
      INSERT INTO auth.sessions (id, user_id) VALUES (${sessionId}::uuid, ${userId}::uuid)
    `;
    return { sessionId, token: signAccessToken(userId, sessionId) };
  }

  it('DELETE /auth/sessions/:id 之后，该会话签发的 token 被 AuthGuard 拒绝', async () => {
    const other = await addSession();
    expect(
      await rejectionType(
        guard.canActivate(createHttpContext(other.token).context),
      ),
    ).toBe('accepted');

    await authService.revokeSession(currentToken, other.sessionId);

    expect(
      await rejectionType(
        guard.canActivate(createHttpContext(other.token).context),
      ),
    ).toBe('https://agentloom.dev/errors/token-revoked');
    expect(
      await rejectionType(
        guard.canActivate(createHttpContext(currentToken).context),
      ),
    ).toBe('accepted');
  });

  it('revoke-all 之后，其他会话的 token 全部被拒绝，当前会话保留', async () => {
    const a = await addSession();
    const b = await addSession();

    await authService.revokeAllSessions(currentToken);

    for (const token of [a.token, b.token]) {
      expect(
        await rejectionType(
          guard.canActivate(createHttpContext(token).context),
        ),
      ).toBe('https://agentloom.dev/errors/token-revoked');
    }
    expect(
      await rejectionType(
        guard.canActivate(createHttpContext(currentToken).context),
      ),
    ).toBe('accepted');
  });

  it('not_after 已过期的会话签发的 token 被拒绝', async () => {
    const expired = await addSession();
    await context.adminSql`
      UPDATE auth.sessions SET not_after = now() - interval '1 minute'
      WHERE id = ${expired.sessionId}::uuid
    `;

    expect(
      await rejectionType(
        guard.canActivate(createHttpContext(expired.token).context),
      ),
    ).toBe('https://agentloom.dev/errors/token-revoked');
  });

  it('auth.sessions 不可读时 fail-closed：带 session_id 的 token 被拒绝', async () => {
    await context.adminSql`ALTER TABLE auth.sessions RENAME TO sessions_hidden`;
    try {
      expect(
        await rejectionType(
          guard.canActivate(createHttpContext(currentToken).context),
        ),
      ).toBe('https://agentloom.dev/errors/session-verification-unavailable');
    } finally {
      await context.adminSql`ALTER TABLE auth.sessions_hidden RENAME TO sessions`;
    }
  });
});
