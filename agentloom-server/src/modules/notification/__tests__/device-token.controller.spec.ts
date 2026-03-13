import 'reflect-metadata';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { DeviceTokenController } from '../device-token.controller';
import { registerDeviceSchema } from '../dto/register-device.dto';
import { unregisterDeviceSchema } from '../dto/unregister-device.dto';

const { createMockDeviceTokenService } = vi.hoisted(() => ({
  createMockDeviceTokenService: () => ({
    register: vi.fn(),
    unregister: vi.fn(),
    findActiveByUserId: vi.fn(),
    deactivateTokens: vi.fn(),
  }),
}));

describe('DeviceTokenController', () => {
  let controller: DeviceTokenController;
  let deviceTokenService: ReturnType<typeof createMockDeviceTokenService>;

  beforeEach(() => {
    vi.clearAllMocks();
    deviceTokenService = createMockDeviceTokenService();
    controller = new DeviceTokenController(deviceTokenService as never);
  });

  it('应注册设备 token', async () => {
    deviceTokenService.register.mockResolvedValue(undefined);

    await expect(
      controller.register('user-1', {
        deviceToken: 'device-token-1',
        platform: 'android',
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(deviceTokenService.register).toHaveBeenCalledWith(
      'user-1',
      'device-token-1',
      'android',
    );
  });

  it('应注销设备 token', async () => {
    deviceTokenService.unregister.mockResolvedValue(undefined);

    await expect(
      controller.unregister('user-1', {
        deviceToken: 'device-token-1',
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(deviceTokenService.unregister).toHaveBeenCalledWith(
      'user-1',
      'device-token-1',
    );
  });

  it('应在控制器上声明 AuthGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      DeviceTokenController,
    ) as unknown[];

    expect(guards).toEqual([AuthGuard]);
  });

  it('应校验注册 DTO', () => {
    expect(
      registerDeviceSchema.parse({
        deviceToken: 'device-token-1',
        platform: 'ios',
      }),
    ).toEqual({
      deviceToken: 'device-token-1',
      platform: 'ios',
    });

    expect(() =>
      registerDeviceSchema.parse({
        deviceToken: '',
        platform: 'web',
      }),
    ).toThrow();
  });

  it('应校验注销 DTO', () => {
    expect(
      unregisterDeviceSchema.parse({
        deviceToken: 'device-token-1',
      }),
    ).toEqual({
      deviceToken: 'device-token-1',
    });

    expect(() =>
      unregisterDeviceSchema.parse({
        deviceToken: '',
      }),
    ).toThrow();
  });
});
