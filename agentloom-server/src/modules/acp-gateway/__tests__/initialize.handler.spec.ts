import { describe, expect, it } from 'vitest';
import { InitializeHandler } from '../handlers/initialize.handler';
import type { AcpClientCapabilities, AcpConnectionState } from '../acp-types';

describe('InitializeHandler', () => {
  it('应返回 agentloom 初始化结果并保存协商状态', async () => {
    const handler = new InitializeHandler();
    const state: AcpConnectionState = {
      initialized: false,
    };
    const clientCapabilities: AcpClientCapabilities = {
      roots: {
        listChanged: true,
      },
      sampling: false,
      fs: {
        read: true,
        write: false,
      },
      terminal: {
        create: true,
        output: true,
      },
      mcpServers: true,
    };

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities,
      },
      state,
    );

    expect(result).toEqual({
      protocolVersion: '2026-02-18',
      serverInfo: {
        name: 'agentloom',
        version: '0.0.1',
        capabilities: {
          loadSession: true,
          streaming: true,
          tools: true,
        },
      },
    });
    expect(result.serverInfo.capabilities).not.toHaveProperty('fs');
    expect(result.serverInfo.capabilities).not.toHaveProperty('terminal');
    expect(result.serverInfo.capabilities).not.toHaveProperty('mcpServers');
    expect(state).toEqual({
      initialized: true,
      clientCapabilities,
      negotiatedProtocolVersion: '2026-02-18',
    });
  });

  it('应拒绝不受支持的协议版本并返回协商提示', async () => {
    const handler = new InitializeHandler();
    const state: AcpConnectionState = {
      initialized: false,
    };

    await expect(
      handler.handle(
        {
          protocolVersion: '2025-01-01',
          clientCapabilities: {},
        },
        state,
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
      data: {
        requestedProtocolVersion: '2025-01-01',
        supportedProtocolVersions: ['2026-02-18'],
      },
    });

    expect(state).toEqual({
      initialized: false,
    });
  });

  it('应拒绝旧版 optional capability 占位形状', async () => {
    const handler = new InitializeHandler();

    await expect(
      handler.handle(
        {
          protocolVersion: '2026-02-18',
          clientCapabilities: {
            fs: {
              enabled: true,
            },
          },
        },
        {
          initialized: false,
        },
      ),
    ).rejects.toMatchObject({
      code: -32602,
      message: 'Invalid params',
    });
  });
});
