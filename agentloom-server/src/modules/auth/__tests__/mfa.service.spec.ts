import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthApiError } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';
import { MfaService } from '../mfa.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  Aal2RequiredException,
  MfaAlreadyEnrolledException,
  MfaDisableException,
  MfaEnrollmentException,
  MfaFactorNotFoundException,
  MfaTokenExpiredException,
  MfaVerificationException,
} from '../../../common/exceptions/auth.exceptions';

const TEST_JWT_SECRET = 'test-mfa-secret';
const TEST_SUPABASE_TOKEN = 'supabase-access-token';
const TEST_FACTOR_ID = '01912345-6789-7abc-8ef0-123456789abc';

function createMockSupabaseService() {
  return {
    enrollTotp: vi.fn(),
    challengeAndVerifyTotp: vi.fn(),
    unenrollFactor: vi.fn(),
    listFactors: vi.fn(),
    getAuthenticatorAssuranceLevel: vi.fn(),
    refreshToken: vi.fn(),
  };
}

function createMockConfigService() {
  return {
    get: vi.fn((key: string) =>
      key === 'APP_JWT_SECRET' ? TEST_JWT_SECRET : undefined,
    ),
  };
}

describe('MfaService', () => {
  let mfaService: MfaService;
  let supabaseService: ReturnType<typeof createMockSupabaseService>;

  beforeEach(async () => {
    supabaseService = createMockSupabaseService();
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
    supabaseService.getAuthenticatorAssuranceLevel.mockResolvedValue({
      currentLevel: 'aal2',
      nextLevel: 'aal2',
      currentAuthenticationMethods: [],
    });
    supabaseService.refreshToken.mockResolvedValue({
      session: {
        access_token: 'downgraded-access-token',
        refresh_token: 'downgraded-refresh-token',
        expires_in: 3600,
      },
    });

    const module = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    mfaService = module.get(MfaService);
  });

  it('enrollTotp 成功返回二维码与密钥信息', async () => {
    supabaseService.enrollTotp.mockResolvedValue({
      id: TEST_FACTOR_ID,
      totp: {
        qr_code: 'mock-qr-code',
        secret: 'mock-secret',
        uri: 'otpauth://totp/mock',
      },
    });

    const result = await mfaService.enrollTotp(TEST_SUPABASE_TOKEN);

    expect(result).toEqual({
      id: TEST_FACTOR_ID,
      qr_code: 'mock-qr-code',
      secret: 'mock-secret',
      uri: 'otpauth://totp/mock',
    });
  });

  it('enrollTotp 在已存在已验证因子时抛出 MfaAlreadyEnrolledException', async () => {
    supabaseService.listFactors.mockResolvedValue({
      totp: [{ id: TEST_FACTOR_ID, status: 'verified' }],
    });

    await expect(
      mfaService.enrollTotp(TEST_SUPABASE_TOKEN),
    ).rejects.toBeInstanceOf(MfaAlreadyEnrolledException);
  });

  it('enrollTotp 在 Supabase 出错时抛出 MfaEnrollmentException', async () => {
    supabaseService.enrollTotp.mockRejectedValue(new Error('enroll failed'));

    await expect(
      mfaService.enrollTotp(TEST_SUPABASE_TOKEN),
    ).rejects.toBeInstanceOf(MfaEnrollmentException);
  });

  it('verifyTotp 使用 access token 成功返回 AAL2 会话令牌', async () => {
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
      expires_in: 3600,
    });

    const result = await mfaService.verifyTotp(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );

    expect(result).toEqual({
      data: {
        tokens: {
          access_token: 'aal2-access-token',
          refresh_token: 'aal2-refresh-token',
          expires_in: 3600,
        },
      },
    });
    expect(supabaseService.challengeAndVerifyTotp).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );
  });

  it('verifyTotp 在 factor 不存在时抛出 MfaFactorNotFoundException', async () => {
    supabaseService.challengeAndVerifyTotp.mockRejectedValue(
      new AuthApiError('factor not found', 404, 'mfa_factor_not_found'),
    );

    await expect(
      mfaService.verifyTotp(TEST_SUPABASE_TOKEN, TEST_FACTOR_ID, '123456'),
    ).rejects.toBeInstanceOf(MfaFactorNotFoundException);
  });

  it('verifyMfaLogin 成功解析 mfa_pending 令牌并返回统一的 tokens 结构', async () => {
    const mfaToken = jwt.sign(
      {
        sub: 'user-1',
        email: 'test@example.com',
        aud: 'authenticated',
        type: 'mfa_pending',
        supabaseAccessToken: TEST_SUPABASE_TOKEN,
      },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '5m' },
    );
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
      expires_in: 3600,
    });

    const result = await mfaService.verifyMfaLogin(
      mfaToken,
      TEST_FACTOR_ID,
      '123456',
    );

    expect(supabaseService.challengeAndVerifyTotp).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );
    expect(result).toEqual({
      data: {
        tokens: {
          access_token: 'aal2-access-token',
          refresh_token: 'aal2-refresh-token',
          expires_in: 3600,
        },
      },
    });
  });

  it('verifyMfaLogin 在令牌过期时抛出 MfaTokenExpiredException', async () => {
    const expiredToken = jwt.sign(
      {
        sub: 'user-1',
        email: 'test@example.com',
        aud: 'authenticated',
        type: 'mfa_pending',
        supabaseAccessToken: TEST_SUPABASE_TOKEN,
      },
      TEST_JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' },
    );

    await expect(
      mfaService.verifyMfaLogin(expiredToken, TEST_FACTOR_ID, '123456'),
    ).rejects.toBeInstanceOf(MfaTokenExpiredException);
  });

  it('verifyMfaLogin 在令牌无效时抛出 MfaVerificationException', async () => {
    await expect(
      mfaService.verifyMfaLogin('invalid-token', TEST_FACTOR_ID, '123456'),
    ).rejects.toBeInstanceOf(MfaVerificationException);
  });

  it('disableMfa 成功完成验证、解除绑定并返回降级后的会话令牌', async () => {
    supabaseService.listFactors.mockResolvedValue({
      totp: [
        {
          id: TEST_FACTOR_ID,
          friendly_name: '主验证器',
          status: 'verified',
          created_at: '2026-03-07T00:00:00.000Z',
          updated_at: '2026-03-07T01:00:00.000Z',
        },
      ],
    });
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
      expires_in: 3600,
    });
    supabaseService.unenrollFactor.mockResolvedValue(undefined);

    const result = await mfaService.disableMfa(TEST_SUPABASE_TOKEN, '123456');

    expect(supabaseService.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
    );
    expect(supabaseService.challengeAndVerifyTotp).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );
    expect(supabaseService.unenrollFactor).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
    );
    expect(supabaseService.refreshToken).toHaveBeenCalledWith(
      'aal2-refresh-token',
    );
    expect(result).toEqual({
      message: 'MFA 已禁用',
      data: {
        tokens: {
          access_token: 'downgraded-access-token',
          refresh_token: 'downgraded-refresh-token',
          expires_in: 3600,
        },
      },
    });
  });

  it('disableMfa 在当前会话不是 AAL2 时抛出 Aal2RequiredException', async () => {
    supabaseService.getAuthenticatorAssuranceLevel.mockResolvedValue({
      currentLevel: 'aal1',
      nextLevel: 'aal2',
      currentAuthenticationMethods: [],
    });

    await expect(
      mfaService.disableMfa(TEST_SUPABASE_TOKEN, '123456'),
    ).rejects.toBeInstanceOf(Aal2RequiredException);
  });

  it('disableMfa 在没有已验证 TOTP 因子时抛出 MfaFactorNotFoundException', async () => {
    await expect(
      mfaService.disableMfa(TEST_SUPABASE_TOKEN, '123456'),
    ).rejects.toBeInstanceOf(MfaFactorNotFoundException);
  });

  it('disableMfa 在 refresh 失败时抛出 MfaDisableException', async () => {
    supabaseService.listFactors.mockResolvedValue({
      totp: [{ id: TEST_FACTOR_ID, status: 'verified' }],
    });
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
      expires_in: 3600,
    });
    supabaseService.unenrollFactor.mockResolvedValue(undefined);
    supabaseService.refreshToken.mockResolvedValue({ session: null });

    await expect(
      mfaService.disableMfa(TEST_SUPABASE_TOKEN, '123456'),
    ).rejects.toBeInstanceOf(MfaDisableException);
  });
});
