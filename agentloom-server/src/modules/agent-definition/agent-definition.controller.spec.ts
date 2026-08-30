import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AgentDefinitionController } from './agent-definition.controller';
import type { AgentDefinitionService } from './agent-definition.service';

const VERSION_DTO = {
  id: 'version-1',
  agentDefinitionId: 'agent-1',
  versionNumber: 1,
  label: 'v1',
  snapshot: {
    runtimeMode: 'sandbox' as const,
    nodes: [],
    edges: [],
    viewport: null,
    metadata: { nodeCount: 0, edgeCount: 0, createdFromVersion: 1 },
  },
  publishedAt: null,
  archivedAt: null,
  createdBy: 'user-1',
  createdAt: '2026-08-27T00:00:00.000Z',
};

describe('AgentDefinitionController rollback', () => {
  it('应由 owner/admin 调用 service 并返回目标版本信封', async () => {
    const service = {
      rollback: vi.fn().mockResolvedValue(VERSION_DTO),
    };
    const controller = new AgentDefinitionController(
      service as unknown as AgentDefinitionService,
    );

    const result = await controller.rollback('agent-1', 'version-1', 'user-1');

    expect(service.rollback).toHaveBeenCalledWith(
      'agent-1',
      'version-1',
      'user-1',
    );
    expect(result).toEqual({ data: VERSION_DTO });
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AgentDefinitionController.prototype.rollback,
      ),
    ).toEqual(['owner', 'admin']);
  });
});
