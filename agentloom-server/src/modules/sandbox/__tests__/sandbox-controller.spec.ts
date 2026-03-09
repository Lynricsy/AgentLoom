import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { SandboxController } from '../sandbox.controller';
import { SandboxService } from '../sandbox.service';

const SESSION_ID = '019391d4-a000-7000-0000-000000000001';

const mockLogs = [
  {
    id: '019391d4-b000-7000-0000-000000000001',
    sessionId: SESSION_ID,
    level: 'system',
    message: 'Container created',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: '019391d4-b000-7000-0000-000000000002',
    sessionId: SESSION_ID,
    level: 'stdout',
    message: 'Hello from sandbox',
    createdAt: new Date('2025-01-01T00:00:01Z'),
  },
];

const mockService: Record<string, ReturnType<typeof vi.fn>> = {
  getSandboxLogs: vi.fn(),
};

describe('SandboxController', () => {
  let controller: SandboxController;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [{ provide: SandboxService, useValue: mockService }],
    }).compile();

    controller = module.get(SandboxController);
  });

  describe('getSandboxLogs', () => {
    it('应返回 { data } 包含日志列表', async () => {
      mockService.getSandboxLogs.mockResolvedValue(mockLogs);

      const result = await controller.getSandboxLogs(SESSION_ID);

      expect(result).toEqual({ data: mockLogs });
      expect(mockService.getSandboxLogs).toHaveBeenCalledWith(SESSION_ID);
    });

    it('无日志时应返回空数组', async () => {
      mockService.getSandboxLogs.mockResolvedValue([]);

      const result = await controller.getSandboxLogs(SESSION_ID);

      expect(result).toEqual({ data: [] });
    });
  });
});
