import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { PrivateCloudController } from '../private-cloud.controller';
import type { PrivateCloudService } from '../private-cloud.service';

const TEST_CONNECTION_RESULT = {
  success: true,
  latencyMs: 32,
  serverInfo: {
    version: 'v1.2.3',
    status: 'healthy',
  },
};

const PRIVATE_CLOUD_MODELS = [
  { id: 'model-a', name: 'model-a', ownedBy: 'team-a' },
  { id: 'model-b', name: 'model-b', ownedBy: 'unknown' },
];

function getRoles(target: object, methodName: string): string[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(target),
    methodName,
  );
  if (!descriptor?.value) return undefined;
  return Reflect.getMetadata(ROLES_KEY, descriptor.value) as
    string[] | undefined;
}

describe('PrivateCloudController', () => {
  let controller: PrivateCloudController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    service = {
      testConnection: vi.fn().mockResolvedValue(TEST_CONNECTION_RESULT),
      fetchModels: vi.fn().mockResolvedValue(PRIVATE_CLOUD_MODELS),
    };

    controller = new PrivateCloudController(
      service as unknown as PrivateCloudService,
    );
  });

  describe('角色权限', () => {
    it('testConnection 应需要 owner、admin、creator 和 operator', () => {
      const roles = getRoles(controller, 'testConnection');

      expect(roles).toEqual(
        expect.arrayContaining(['owner', 'admin', 'creator', 'operator']),
      );
      expect(roles).not.toContain('viewer');
    });

    it('fetchModels 应需要 owner、admin、creator 和 operator', () => {
      const roles = getRoles(controller, 'fetchModels');

      expect(roles).toEqual(
        expect.arrayContaining(['owner', 'admin', 'creator', 'operator']),
      );
      expect(roles).not.toContain('viewer');
    });
  });

  describe('testConnection', () => {
    it('应当调用 service.testConnection 并返回 { data }', async () => {
      const dto = {
        endpointUrl: 'https://private-cloud.example.com/v1',
        authMethod: 'api_key',
        apiKey: 'sk-direct-input',
        timeoutMs: 10_000,
      };

      const result = await controller.testConnection(
        dto as never,
        'tenant-id',
        'org-id',
      );

      expect(service.testConnection).toHaveBeenCalledWith(dto, {
        tenantId: 'tenant-id',
        orgId: 'org-id',
      });
      expect(result).toEqual({ data: TEST_CONNECTION_RESULT });
    });
  });

  describe('fetchModels', () => {
    it('应当调用 service.fetchModels 并返回 { data }', async () => {
      const dto = {
        endpointUrl: 'https://private-cloud.example.com/v1',
        authMethod: 'none',
      };

      const result = await controller.fetchModels(
        dto as never,
        'tenant-id',
        'org-id',
      );

      expect(service.fetchModels).toHaveBeenCalledWith(dto, {
        tenantId: 'tenant-id',
        orgId: 'org-id',
      });
      expect(result).toEqual({ data: PRIVATE_CLOUD_MODELS });
    });
  });
});
