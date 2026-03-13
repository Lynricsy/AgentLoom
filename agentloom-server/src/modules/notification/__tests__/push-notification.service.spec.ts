import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeviceTokenService } from '../device-token.service';
import { PushNotificationService } from '../push-notification.service';

const adminMocks = vi.hoisted(() => {
  const apps: Array<Record<string, unknown>> = [];
  const cert = vi.fn((serviceAccount: unknown) => ({ serviceAccount }));
  const initializeApp = vi.fn(() => {
    const app = { name: `firebase-app-${apps.length + 1}` };
    apps.push(app);
    return app;
  });
  const sendEachForMulticast = vi.fn();
  const messaging = vi.fn(() => ({ sendEachForMulticast }));

  return {
    apps,
    cert,
    initializeApp,
    sendEachForMulticast,
    messaging,
  };
});

vi.mock('firebase-admin', () => ({
  apps: adminMocks.apps,
  credential: {
    cert: adminMocks.cert,
  },
  initializeApp: adminMocks.initializeApp,
  messaging: adminMocks.messaging,
}));

const mocks = vi.hoisted(() => ({
  createMockConfigService: () => ({
    get: vi.fn(),
  }),
  createMockDeviceTokenService: () => ({
    register: vi.fn(),
    unregister: vi.fn(),
    findActiveByUserId: vi.fn(),
    deactivateTokens: vi.fn(),
  }),
}));

const validServiceAccount = JSON.stringify({
  project_id: 'agentloom-test',
  client_email: 'firebase-adminsdk@test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n',
});

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let configService: ReturnType<typeof mocks.createMockConfigService>;
  let deviceTokenService: ReturnType<typeof mocks.createMockDeviceTokenService>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminMocks.apps.splice(0, adminMocks.apps.length);

    configService = mocks.createMockConfigService();
    deviceTokenService = mocks.createMockDeviceTokenService();

    warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        { provide: ConfigService, useValue: configService },
        { provide: DeviceTokenService, useValue: deviceTokenService },
      ],
    }).compile();

    service = module.get(PushNotificationService);
  });

  it('onModuleInit 在缺少配置时应 warn 并保持禁用', () => {
    configService.get.mockReturnValue(undefined);

    service.onModuleInit();

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
    expect(service.isEnabled).toBe(false);
  });

  it('onModuleInit 在配置有效时应初始化 FCM', () => {
    configService.get.mockReturnValue(validServiceAccount);

    service.onModuleInit();

    expect(adminMocks.cert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'agentloom-test',
        client_email: 'firebase-adminsdk@test.iam.gserviceaccount.com',
      }),
    );
    expect(adminMocks.initializeApp).toHaveBeenCalledOnce();
    expect(adminMocks.messaging).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('Firebase Cloud Messaging 已初始化');
    expect(service.isEnabled).toBe(true);
  });

  it('onModuleInit 在 JSON 非法时应 error 并保持禁用', () => {
    configService.get.mockReturnValue('{invalid-json');

    service.onModuleInit();

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(adminMocks.initializeApp).not.toHaveBeenCalled();
    expect(service.isEnabled).toBe(false);
  });

  it('sendToUser 在服务禁用时应直接跳过', async () => {
    await service.sendToUser('user-1', {
      title: '执行完成',
      body: '工作流执行完成',
      data: { executionId: 'exec-1' },
    });

    expect(deviceTokenService.findActiveByUserId).not.toHaveBeenCalled();
    expect(adminMocks.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sendToUser 在没有有效 token 时应直接跳过', async () => {
    configService.get.mockReturnValue(validServiceAccount);
    deviceTokenService.findActiveByUserId.mockResolvedValue([]);
    service.onModuleInit();

    await service.sendToUser('user-1', {
      title: '执行完成',
      body: '工作流执行完成',
      data: { executionId: 'exec-1' },
    });

    expect(deviceTokenService.findActiveByUserId).toHaveBeenCalledWith(
      'user-1',
    );
    expect(adminMocks.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('sendToUser 应正常发送推送', async () => {
    configService.get.mockReturnValue(validServiceAccount);
    deviceTokenService.findActiveByUserId.mockResolvedValue([
      { deviceToken: 'token-a', platform: 'android' },
      { deviceToken: 'token-b', platform: 'ios' },
    ]);
    adminMocks.sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: true }],
    });
    service.onModuleInit();

    await service.sendToUser('user-1', {
      title: '执行完成',
      body: '工作流执行完成',
      data: { executionId: 'exec-1', workflowId: 'wf-1' },
    });

    expect(adminMocks.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['token-a', 'token-b'],
      notification: {
        title: '执行完成',
        body: '工作流执行完成',
      },
      data: { executionId: 'exec-1', workflowId: 'wf-1' },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    expect(deviceTokenService.deactivateTokens).not.toHaveBeenCalled();
  });

  it('sendToUser 在部分失败时应失活无效 token', async () => {
    configService.get.mockReturnValue(validServiceAccount);
    deviceTokenService.findActiveByUserId.mockResolvedValue([
      { deviceToken: 'token-a', platform: 'android' },
      { deviceToken: 'token-b', platform: 'ios' },
      { deviceToken: 'token-c', platform: 'ios' },
    ]);
    adminMocks.sendEachForMulticast.mockResolvedValue({
      responses: [
        { success: true },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    service.onModuleInit();

    await service.sendToUser('user-1', {
      title: '执行失败',
      body: '工作流执行失败',
      data: { executionId: 'exec-1' },
    });

    expect(deviceTokenService.deactivateTokens).toHaveBeenCalledWith([
      'token-b',
    ]);
  });

  it('sendToUser 在全部无效时应失活全部失败 token', async () => {
    configService.get.mockReturnValue(validServiceAccount);
    deviceTokenService.findActiveByUserId.mockResolvedValue([
      { deviceToken: 'token-a', platform: 'android' },
      { deviceToken: 'token-b', platform: 'ios' },
    ]);
    adminMocks.sendEachForMulticast.mockResolvedValue({
      responses: [
        {
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        },
        {
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        },
      ],
    });
    service.onModuleInit();

    await service.sendToUser('user-1', {
      title: '需要介入',
      body: '节点等待人工介入',
      data: { executionId: 'exec-1', nodeId: 'node-1' },
    });

    expect(deviceTokenService.deactivateTokens).toHaveBeenCalledWith([
      'token-a',
      'token-b',
    ]);
  });

  it('sendToUser 在 token 超过 150 个时应分批发送', async () => {
    configService.get.mockReturnValue(validServiceAccount);
    deviceTokenService.findActiveByUserId.mockResolvedValue(
      Array.from({ length: 151 }, (_, index) => ({
        deviceToken: `token-${index + 1}`,
        platform: index % 2 === 0 ? 'android' : 'ios',
      })),
    );
    adminMocks.sendEachForMulticast.mockResolvedValue({
      responses: Array.from({ length: 150 }, () => ({ success: true })),
    });
    service.onModuleInit();

    await service.sendToUser('user-1', {
      title: '批量通知',
      body: '批量通知正文',
      data: { workflowId: 'wf-1' },
    });

    expect(adminMocks.sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(adminMocks.sendEachForMulticast).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tokens: Array.from({ length: 150 }, (_, index) => `token-${index + 1}`),
      }),
    );
    expect(adminMocks.sendEachForMulticast).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tokens: ['token-151'],
      }),
    );
  });
});
