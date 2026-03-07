import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { MfaController } from '../mfa.controller';
import type { MfaService } from '../mfa.service';

function getMethodPublicMetadata(methodName: keyof MfaController) {
  const handler = Object.getOwnPropertyDescriptor(
    MfaController.prototype,
    methodName,
  )?.value;

  return handler ? Reflect.getMetadata(IS_PUBLIC_KEY, handler) : undefined;
}

describe('MfaController', () => {
  let controller: MfaController;
  let service: {
    enrollTotp: ReturnType<typeof vi.fn>;
    verifyTotp: ReturnType<typeof vi.fn>;
    verifyMfaLogin: ReturnType<typeof vi.fn>;
    disableMfa: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      enrollTotp: vi.fn(),
      verifyTotp: vi.fn(),
      verifyMfaLogin: vi.fn(),
      disableMfa: vi.fn(),
    };

    controller = new MfaController(service as unknown as MfaService);
  });

  it('POST totp/enroll 成功调用服务', async () => {
    service.enrollTotp.mockResolvedValue({ id: 'factor-1' });

    const result = await controller.enrollTotp({
      headers: {
        authorization: 'Bearer access-token',
      },
    } as never);

    expect(service.enrollTotp).toHaveBeenCalledWith('access-token');
    expect(result).toEqual({ id: 'factor-1' });
  });

  it('POST totp/verify 公开访问并支持 snake_case 的 factor_id', async () => {
    service.verifyTotp.mockResolvedValue({
      data: {
        tokens: {
          access_token: 'aal2-access-token',
          refresh_token: 'aal2-refresh-token',
          expires_in: 3600,
        },
      },
    });

    const result = await controller.verifyTotp(
      {
        factor_id: '01912345-6789-7abc-8ef0-123456789abc',
        code: '123456',
      },
      {
        headers: {
          authorization: 'Bearer mfa-token',
        },
      } as never,
    );

    expect(getMethodPublicMetadata('verifyTotp')).toBe(true);
    expect(service.verifyTotp).toHaveBeenCalledWith(
      'mfa-token',
      '01912345-6789-7abc-8ef0-123456789abc',
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

  it('POST login/verify 保持公开访问并透传统一的 tokens 结构', async () => {
    service.verifyMfaLogin.mockResolvedValue({
      data: {
        tokens: {
          access_token: 'aal2-access-token',
          refresh_token: 'aal2-refresh-token',
          expires_in: 3600,
        },
      },
    });

    const result = await controller.verifyMfaLogin({
      mfa_token: 'mfa-token',
      factor_id: '01912345-6789-7abc-8ef0-123456789abc',
      code: '123456',
    });

    expect(service.verifyMfaLogin).toHaveBeenCalledWith(
      'mfa-token',
      '01912345-6789-7abc-8ef0-123456789abc',
      '123456',
    );
    expect(getMethodPublicMetadata('verifyMfaLogin')).toBe(true);
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

  it('DELETE / 只传递访问令牌和验证码给服务', async () => {
    service.disableMfa.mockResolvedValue({ message: 'MFA 已禁用' });

    const result = await controller.disableMfa(
      { code: '123456' },
      {
        headers: {
          authorization: 'Bearer access-token',
        },
      } as never,
    );

    expect(service.disableMfa).toHaveBeenCalledWith('access-token', '123456');
    expect(result).toEqual({ message: 'MFA 已禁用' });
  });
});
