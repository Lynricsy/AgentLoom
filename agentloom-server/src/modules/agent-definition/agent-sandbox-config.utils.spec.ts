import { describe, expect, it } from 'vitest';

import { deriveAgentSandboxConfigFromCanvas } from './agent-sandbox-config.utils';

describe('deriveAgentSandboxConfigFromCanvas', () => {
  it('应从 sandbox 节点的 timeoutSeconds 恢复秒级超时并挂载 workspace 绑定', () => {
    const sandboxConfig = deriveAgentSandboxConfigFromCanvas(
      [
        {
          id: 'agent-main',
          type: 'agent',
          data: {
            nodeType: 'agent-main',
          },
          position: { x: 0, y: 0 },
        },
        {
          id: 'sandbox-1',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            cpuLimit: 3,
            memoryLimitMb: 1536,
            diskLimitGb: 6,
            timeoutSeconds: 450,
          },
          position: { x: 100, y: 0 },
        },
        {
          id: 'workspace-1',
          type: 'tool',
          data: {
            nodeType: 'workspace',
            workspaceId: 'workspace-restore-1',
          },
          position: { x: 100, y: 100 },
        },
      ] as never,
      [
        {
          id: 'edge-sandbox-main',
          source: 'sandbox-1',
          target: 'agent-main',
          sourceHandle: 'sandbox-out',
          targetHandle: 'sandbox-in',
        },
        {
          id: 'edge-workspace-sandbox',
          source: 'workspace-1',
          target: 'sandbox-1',
          sourceHandle: 'volume-out',
          targetHandle: 'volume-in',
        },
      ] as never,
      {
        cpu: 3,
        memory: 1536,
        disk: 6,
        timeout: 450,
      },
    );

    expect(sandboxConfig).toEqual({
      cpu: 3,
      memory: 1536,
      disk: 6,
      timeout: 1,
      timeoutSeconds: 450,
      restoreWorkspaceId: 'workspace-restore-1',
    });
  });

  it('没有画布 sandbox 节点时应回退到已有 persisted config', () => {
    const sandboxConfig = deriveAgentSandboxConfigFromCanvas([], [], {
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 24,
      lifecycleMode: 'persistent',
    });

    expect(sandboxConfig).toEqual({
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 24,
      lifecycleMode: 'persistent',
    });
  });
});
