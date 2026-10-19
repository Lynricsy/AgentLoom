import type { ArgumentMetadata } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AgentDefinitionController } from './agent-definition.controller';
import type { AgentDefinitionService } from './agent-definition.service';
import { ListAgentVersionsQuerySchema } from './dto';

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
  it('应调用 service 并返回目标版本信封', async () => {
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
  });
});

describe('AgentDefinitionController 状态码', () => {
  it('compile 与 publish 不创建资源，返回 200 而非 201', () => {
    const prototype = AgentDefinitionController.prototype;

    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, prototype.compileCanvas),
    ).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, prototype.publish)).toBe(
      HttpStatus.OK,
    );
  });
});

describe('GET /agent-definitions/:id/versions 分页参数', () => {
  const pipe = new ZodValidationPipe(ListAgentVersionsQuerySchema);
  const metadata: ArgumentMetadata = { type: 'query', data: undefined };

  it('缺省时使用 page=1、pageSize=20', () => {
    expect(pipe.transform({}, metadata)).toEqual({ page: 1, pageSize: 20 });
  });

  it.each([
    [{ page: '0' }],
    [{ page: 'abc' }],
    [{ pageSize: '-5' }],
    [{ pageSize: '100000' }],
  ])('非法分页 %o 返回 422 而不是 500 或原样回显', (query) => {
    expect(() => pipe.transform(query, metadata)).toThrow();
  });

  it('controller 把解析后的分页传给 service', async () => {
    const service = {
      listVersions: vi.fn().mockResolvedValue({ data: [], meta: {} }),
    };
    const controller = new AgentDefinitionController(
      service as unknown as AgentDefinitionService,
    );

    await controller.listVersions('agent-1', { page: 2, pageSize: 50 });

    expect(service.listVersions).toHaveBeenCalledWith('agent-1', 2, 50);
  });
});
