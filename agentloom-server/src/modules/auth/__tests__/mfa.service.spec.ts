import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { MfaService } from '../mfa.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  MfaAlreadyEnrolledException,
  MfaDisableException,
  MfaEnrollmentException,
  MfaTokenExpiredException,
  MfaVerificationException,
} from '../../../common/exceptions/auth.exceptions';

const TEST_JWT_SECRET = 'test-mfa-secret';
const TEST_SUPABASE_TOKEN = 'supabase-access-token';
const TEST_FACTOR_ID = '01912345-6789-7abc-def0-123456789abc';

function createMockSupabaseService() {
  return {
    enrollTotp: vi.fn(),
    challengeAndVerifyTotp: vi.fn(),
    unenrollFactor: vi.fn(),
    listFactors: vi.fn(),
    createUserClient: vi.fn(),
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
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
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
      totp: [
        {
          id: TEST_FACTOR_ID,
          status: 'verified',
        },
      ],
    });

    await expect(mfaService.enrollTotp(TEST_SUPABASE_TOKEN)).rejects.toBeInstanceOf(
      MfaAlreadyEnrolledException,
    );
  });

  it('enrollTotp 在 Supabase 出错时抛出 MfaEnrollmentException', async () => {
    supabaseService.listFactors.mockResolvedValue({ totp: [] });
    supabaseService.enrollTotp.mockRejectedValue(new Error('enroll failed'));

    await expect(mfaService.enrollTotp(TEST_SUPABASE_TOKEN)).rejects.toBeInstanceOf(
      MfaEnrollmentException,
    );
  });

  it('verifyTotp 成功返回成功消息', async () => {
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
    });

    const result = await mfaService.verifyTotp(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );

    expect(result).toEqual({ message: 'MFA 验证成功' });
    expect(supabaseService.challengeAndVerifyTotp).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );
  });

  it('verifyTotp 在验证码错误时抛出 MfaVerificationException', async () => {
    supabaseService.challengeAndVerifyTotp.mockRejectedValue(
      new Error('invalid code'),
    );

    await expect(
      mfaService.verifyTotp(TEST_SUPABASE_TOKEN, TEST_FACTOR_ID, '000000'),
    ).rejects.toBeInstanceOf(MfaVerificationException);
  });

  it('verifyMfaLogin 成功返回新的会话令牌', async () => {
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
    });

    const result = await mfaService.verifyMfaLogin(
      mfaToken,
      TEST_FACTOR_ID,
      '123456',
    );

    expect(result).toEqual({
      accessToken: 'aal2-access-token',
      refreshToken: 'aal2-refresh-token',
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

  it('disableMfa 成功禁用 MFA', async () => {
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
    });
    supabaseService.unenrollFactor.mockResolvedValue(undefined);

    const result = await mfaService.disableMfa(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
      '123456',
    );

    expect(result).toEqual({ message: 'MFA 已禁用' });
    expect(supabaseService.unenrollFactor).toHaveBeenCalledWith(
      TEST_SUPABASE_TOKEN,
      TEST_FACTOR_ID,
    );
  });

  it('disableMfa 在 Supabase 出错时抛出 MfaDisableException', async () => {
    supabaseService.challengeAndVerifyTotp.mockResolvedValue({
      access_token: 'aal2-access-token',
      refresh_token: 'aal2-refresh-token',
    });
    supabaseService.unenrollFactor.mockRejectedValue(new Error('unenroll failed'));

    await expect(
      mfaService.disableMfa(TEST_SUPABASE_TOKEN, TEST_FACTOR_ID, '123456'),
    ).rejects.toBeInstanceOf(MfaDisableException);
  });

  it('getSecurityInfo 成功返回安全信息结构', async () => {
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

    const result = await mfaService.getSecurityInfo(TEST_SUPABASE_TOKEN);

    expect(result).toEqual({
      mfaEnabled: true,
      factors: [
        {
          id: TEST_FACTOR_ID,
          factorType: 'totp',
          friendlyName: '主验证器',
          status: 'verified',
          createdAt: '2026-03-07T00:00:00.000Z',
          updatedAt: '2026-03-07T01:00:00.000Z',
        },
      ],
    });
  });
});
