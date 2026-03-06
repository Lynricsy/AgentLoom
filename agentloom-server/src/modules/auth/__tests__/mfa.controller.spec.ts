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

  it('POST totp/verify 成功调用服务', async () => {
    service.verifyTotp.mockResolvedValue({ message: 'MFA 验证成功' });

    const result = await controller.verifyTotp(
      {
        factorId: '01912345-6789-7abc-def0-123456789abc',
        code: '123456',
      },
      {
        headers: {
          authorization: 'Bearer access-token',
        },
      } as never,
    );

    expect(service.verifyTotp).toHaveBeenCalledWith(
      'access-token',
      '01912345-6789-7abc-def0-123456789abc',
      '123456',
    );
    expect(result).toEqual({ message: 'MFA 验证成功' });
  });

  it('POST login/verify 成功返回包装后的令牌并保持公开访问', async () => {
    service.verifyMfaLogin.mockResolvedValue({
      accessToken: 'aal2-access-token',
      refreshToken: 'aal2-refresh-token',
    });

    const result = await controller.verifyMfaLogin({
      mfaToken: 'mfa-token',
      factorId: '01912345-6789-7abc-def0-123456789abc',
      code: '123456',
    });

    expect(service.verifyMfaLogin).toHaveBeenCalledWith(
      'mfa-token',
      '01912345-6789-7abc-def0-123456789abc',
      '123456',
    );
    expect(getMethodPublicMetadata('verifyMfaLogin')).toBe(true);
    expect(result).toEqual({
      data: {
        tokens: {
          accessToken: 'aal2-access-token',
          refreshToken: 'aal2-refresh-token',
        },
      },
    });
  });

  it('DELETE / 成功调用服务', async () => {
    service.disableMfa.mockResolvedValue({ message: 'MFA 已禁用' });

    const result = await controller.disableMfa(
      {
        factorId: '01912345-6789-7abc-def0-123456789abc',
        code: '123456',
      },
      {
        headers: {
          authorization: 'Bearer access-token',
        },
      } as never,
    );

    expect(service.disableMfa).toHaveBeenCalledWith(
      'access-token',
      '01912345-6789-7abc-def0-123456789abc',
      '123456',
    );
    expect(result).toEqual({ message: 'MFA 已禁用' });
  });
});
