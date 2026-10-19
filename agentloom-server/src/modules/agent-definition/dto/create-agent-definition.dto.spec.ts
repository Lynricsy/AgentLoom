import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateAgentDefinitionDto } from './create-agent-definition.dto';
import { SaveAgentCanvasDto } from './save-agent-canvas.dto';

const pipe = new ZodValidationPipe();

function transformWithDto<T>(
  value: unknown,
  metatype: new (...args: never[]) => T,
  type: ArgumentMetadata['type'],
): T {
  return pipe.transform(value, {
    type,
    metatype,
    data: undefined,
  }) as T;
}

describe('CreateAgentDefinitionDto', () => {
  it('应同时接受 camelCase 与 snake_case 的 runtimeMode', async () => {
    expect(
      transformWithDto(
        {
          name: 'No Sandbox Agent',
          runtimeMode: 'no_sandbox',
          globalSandboxConfig: {
            enabled: true,
          },
        },
        CreateAgentDefinitionDto,
        'body',
      ),
    ).toEqual({
      name: 'No Sandbox Agent',
      description: undefined,
      icon: undefined,
      runtimeMode: 'no_sandbox',
      globalSandboxConfig: {
        enabled: true,
      },
    });

    expect(
      transformWithDto(
        {
          name: 'Sandbox Agent',
          description: 'snake_case payload',
          runtime_mode: 'sandbox',
          global_sandbox_config: {
            enabled: true,
            timeoutSeconds: 600,
          },
        },
        CreateAgentDefinitionDto,
        'body',
      ),
    ).toEqual({
      name: 'Sandbox Agent',
      description: 'snake_case payload',
      icon: undefined,
      runtimeMode: 'sandbox',
      globalSandboxConfig: {
        enabled: true,
        timeoutSeconds: 600,
      },
    });
  });

  it('拒绝未知字段而不是静默丢弃', () => {
    expect(() =>
      transformWithDto(
        {
          name: 'Bogus Agent',
          runtimeMode: 'no_sandbox',
          nodes: [1],
          bogus: 1,
        },
        CreateAgentDefinitionDto,
        'body',
      ),
    ).toThrow();
  });
});

describe('SaveAgentCanvasDto', () => {
  it('接受 Studio 发送的全部画布字段', () => {
    expect(
      transformWithDto(
        {
          canvasNodes: [],
          canvasEdges: [],
          canvasViewport: { x: 0, y: 0, zoom: 1 },
          inputSchema: {},
          memoryInstanceIds: [],
          globalSandboxConfig: {},
          sandboxLifecycle: 'session',
          workspaceSnapshotId: null,
        },
        SaveAgentCanvasDto,
        'body',
      ),
    ).toMatchObject({ canvasNodes: [], canvasEdges: [] });
  });

  it('拒绝未知字段而不是静默丢弃', () => {
    expect(() =>
      transformWithDto(
        { canvasNodes: [], canvasEdges: [], bogusField: 1 },
        SaveAgentCanvasDto,
        'body',
      ),
    ).toThrow();
  });
});
