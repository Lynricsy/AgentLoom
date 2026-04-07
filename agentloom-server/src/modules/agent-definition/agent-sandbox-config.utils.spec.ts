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
      conversationIdleAutoEndMinutes: 10,
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
      conversationIdleAutoEndMinutes: 10,
      lifecycleMode: 'persistent',
    });
  });

  it('存在 agent-main 但 sandbox 未连接时不应回退到孤儿节点或 persisted config', () => {
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
          id: 'sandbox-orphan',
          type: 'tool',
          data: {
            nodeType: 'sandbox',
            cpuLimit: 2,
            memoryLimitMb: 1024,
            diskLimitGb: 4,
            timeoutSeconds: 600,
          },
          position: { x: 100, y: 0 },
        },
      ] as never,
      [] as never,
      {
        cpu: 9,
        memory: 9999,
        disk: 9,
        timeout: 9,
      },
    );

    expect(sandboxConfig).toBeNull();
  });

  it('sandbox 节点存在过期顶层镜像字段时应优先采用 data.config 的生命周期配置', () => {
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
            lifecycleMode: 'session',
            timeoutSeconds: 600,
            memoryLimitMb: 1024,
            config: {
              cpu: 1,
              memory: 512,
              disk: 2,
              timeout: 2,
              lifecycleMode: 'persistent',
              persistentSandboxId: 'persistent-sandbox-1',
            },
          },
          position: { x: 100, y: 0 },
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
      ] as never,
    );

    expect(sandboxConfig).toEqual({
      cpu: 1,
      memory: 512,
      disk: 2,
      timeout: 1,
      timeoutSeconds: 600,
      conversationIdleAutoEndMinutes: 10,
      lifecycleMode: 'persistent',
      persistentSandboxId: 'persistent-sandbox-1',
    });
  });
});
