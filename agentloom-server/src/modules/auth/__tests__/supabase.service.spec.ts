import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthUnavailableException } from '../../../common/exceptions/auth.exceptions';

const { createClientMock, adminClient, oauthClient } = vi.hoisted(() => {
  const adminClient = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      refreshSession: vi.fn(),
      getUser: vi.fn(),
      admin: {
        signOut: vi.fn(),
      },
    },
  };

  const oauthClient = {
    auth: {
      signInWithOAuth: vi.fn(),
      exchangeCodeForSession: vi.fn(),
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
        listFactors: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn(),
      },
    },
  };

  return {
    createClientMock: vi.fn(),
    adminClient,
    oauthClient,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}));

function createMockConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('SupabaseService', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    adminClient.auth.signInWithPassword.mockReset();
  });

  it('private 模式缺少 APP_SUPABASE_* 时构造期不创建 client，调用时显式报不可用', async () => {
    const service = new SupabaseService(
      createMockConfigService({
        APP_DEPLOYMENT_MODE: 'private',
      }),
    );

    expect(createClientMock).not.toHaveBeenCalled();
    await expect(
      service.signIn('test@example.com', 'Password123'),
    ).rejects.toBeInstanceOf(AuthUnavailableException);
  });

  it('完整配置下会创建 admin 与 oauth client', async () => {
    createClientMock
      .mockReturnValueOnce(adminClient)
      .mockReturnValueOnce(oauthClient);
    adminClient.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: null,
        session: null,
      },
      error: null,
    });

    const service = new SupabaseService(
      createMockConfigService({
        APP_DEPLOYMENT_MODE: 'saas',
        APP_SUPABASE_URL: 'https://example.supabase.co',
        APP_SUPABASE_ANON_KEY: 'anon-key',
        APP_SUPABASE_SERVICE_KEY: 'service-key',
      }),
    );

    await service.signIn('test@example.com', 'Password123');

    expect(createClientMock).toHaveBeenCalledTimes(2);
  });

  it('查询 AAL 时显式传入 JWT（user client 无持久会话）', async () => {
    createClientMock.mockReturnValue(oauthClient);
    oauthClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal2',
        nextLevel: 'aal2',
        currentAuthenticationMethods: [],
      },
      error: null,
    });

    const service = new SupabaseService(
      createMockConfigService({
        APP_DEPLOYMENT_MODE: 'saas',
        APP_SUPABASE_URL: 'https://example.supabase.co',
        APP_SUPABASE_ANON_KEY: 'anon-key',
        APP_SUPABASE_SERVICE_KEY: 'service-key',
      }),
    );

    await expect(
      service.getAuthenticatorAssuranceLevel('aal2-access-token'),
    ).resolves.toMatchObject({ currentLevel: 'aal2' });
    expect(
      oauthClient.auth.mfa.getAuthenticatorAssuranceLevel,
    ).toHaveBeenCalledWith('aal2-access-token');
  });
});
