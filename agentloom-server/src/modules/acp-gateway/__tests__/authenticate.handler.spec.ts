import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { TokenBlacklistService } from '../../../common/services/token-blacklist.service';
import { AuthenticateHandler } from '../handlers/authenticate.handler';
import { AcpAuthenticationService } from '../acp-authentication.service';
import type { AcpConnectionState } from '../acp-types';

const TEST_SECRET = 'test-e2e-jwt-secret';

function createAccessToken(payload: Record<string, unknown>) {
  return jwt.sign(
    {
      aud: 'authenticated',
      email: 'user@example.com',
      sub: 'user-1',
      ...payload,
    },
    TEST_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
    },
  );
}

async function createModule() {
  const tokenBlacklistService = {
    isBlacklisted: vi.fn().mockResolvedValue(false),
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      AuthenticateHandler,
      AcpAuthenticationService,
      {
        provide: ConfigService,
        useValue: {
          get: vi.fn().mockImplementation((key: string) => {
            if (key === 'APP_JWT_SECRET') {
              return TEST_SECRET;
            }

            return undefined;
          }),
        },
      },
      {
        provide: TokenBlacklistService,
        useValue: tokenBlacklistService,
      },
    ],
  }).compile();

  return {
    handler: moduleRef.get(AuthenticateHandler),
    tokenBlacklistService,
  };
}

describe('AuthenticateHandler', () => {
  it('应复用 JWT 语义并将认证上下文绑定到连接状态', async () => {
    const { handler, tokenBlacklistService } = await createModule();
    const state: AcpConnectionState = {
      initialized: true,
    };

    const result = await handler.handle(
      {
        token: createAccessToken({
          tenant_id: 'tenant-1',
          tenant_role: 'owner',
          org_id: 'org-1',
        }),
      },
      state,
    );

    expect(tokenBlacklistService.isBlacklisted).toHaveBeenCalledOnce();
    expect(result).toEqual({ authenticated: true });
    expect(state.authContext).toEqual({
      userId: 'user-1',
      email: 'user@example.com',
      tenantId: 'tenant-1',
      tenantRole: 'owner',
      orgId: 'org-1',
      authMethod: 'jwt',
    });
  });

  it('应在 token 被撤销时拒绝认证且不污染连接状态', async () => {
    const { handler, tokenBlacklistService } = await createModule();
    const state: AcpConnectionState = {
      initialized: true,
    };
    tokenBlacklistService.isBlacklisted.mockResolvedValueOnce(true);

    await expect(
      handler.handle({ token: createAccessToken({}) }, state),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/token-revoked',
    });
    expect(state.authContext).toBeUndefined();
  });

  it('应在 token 过期时拒绝认证且不污染连接状态', async () => {
    const { handler } = await createModule();
    const state: AcpConnectionState = {
      initialized: true,
    };
    const expiredToken = jwt.sign(
      {
        aud: 'authenticated',
        email: 'user@example.com',
        sub: 'user-1',
      },
      TEST_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: -1,
      },
    );

    await expect(
      handler.handle({ token: expiredToken }, state),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/token-expired',
    });
    expect(state.authContext).toBeUndefined();
  });

  it('应在 token 签名非法时拒绝认证且不污染连接状态', async () => {
    const { handler } = await createModule();
    const state: AcpConnectionState = {
      initialized: true,
    };

    await expect(
      handler.handle(
        {
          token: jwt.sign(
            {
              aud: 'authenticated',
              email: 'user@example.com',
              sub: 'user-1',
            },
            'wrong-secret',
            {
              algorithm: 'HS256',
              expiresIn: '1h',
            },
          ),
        },
        state,
      ),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/token-invalid',
    });
    expect(state.authContext).toBeUndefined();
  });

  it('应在 MFA pending token 时拒绝认证且不污染连接状态', async () => {
    const { handler } = await createModule();
    const state: AcpConnectionState = {
      initialized: true,
    };

    await expect(
      handler.handle(
        {
          token: createAccessToken({ type: 'mfa_pending' }),
        },
        state,
      ),
    ).rejects.toMatchObject({
      type: 'https://agentloom.dev/errors/mfa-required',
    });
    expect(state.authContext).toBeUndefined();
  });
});
