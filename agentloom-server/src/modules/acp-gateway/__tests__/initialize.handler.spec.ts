import { describe, expect, it, vi } from 'vitest';
import { InitializeHandler } from '../handlers/initialize.handler';
import type { AcpConnectionState } from '../acp-types';

describe('InitializeHandler', () => {
  it('应返回 agentloom 初始化结果并按真实服务能力声明 fs capability', async () => {
    const handler = new InitializeHandler();
    const state: AcpConnectionState = {
      initialized: false,
      requestClient: vi.fn(),
    };
    const clientCapabilities = {
      roots: {
        listChanged: true,
      },
      sampling: false,
      fs: {
        readTextFile: true,
        writeTextFile: false,
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
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
          terminal: {
            create: true,
          },
        },
      },
    });
    expect(result.serverInfo.capabilities).not.toHaveProperty('mcpServers');
    expect(state).toEqual({
      initialized: true,
      clientCapabilities,
      negotiatedProtocolVersion: '2026-02-18',
      requestClient: expect.any(Function),
    });
  });

  it('应兼容 legacy fs alias 并归一化为 canonical capability 形状', async () => {
    const handler = new InitializeHandler();
    const state: AcpConnectionState = {
      initialized: false,
      requestClient: vi.fn(),
    };

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities: {
          fs: {
            read: true,
            write: false,
          },
        },
      },
      state,
    );

    expect(result.serverInfo.capabilities.fs).toEqual({
      readTextFile: true,
      writeTextFile: true,
    });
    expect(state.clientCapabilities?.fs).toEqual({
      readTextFile: true,
      writeTextFile: false,
    });
  });

  it('应在 client 未声明 terminal capability 时不暴露 terminal 能力', async () => {
    const handler = new InitializeHandler();

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: false,
          },
        },
      },
      {
        initialized: false,
      },
    );

    expect(result.serverInfo.capabilities).toEqual({
      loadSession: true,
      streaming: true,
      tools: true,
      fs: {
        readTextFile: true,
        writeTextFile: false,
      },
    });
    expect(result.serverInfo.capabilities).not.toHaveProperty('terminal');
  });

  it('应在 client terminal 子能力不完整时保持 capability honesty 并隐藏 terminal', async () => {
    const handler = new InitializeHandler();
    const state: AcpConnectionState = {
      initialized: false,
    };

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities: {
          terminal: {
            create: true,
            output: false,
          },
        },
      },
      state,
    );

    expect(result.serverInfo.capabilities).not.toHaveProperty('terminal');
    expect(state.clientCapabilities?.terminal).toEqual({
      create: true,
      output: false,
    });
  });

  it('应在缺少 requestClient transport 时只暴露 server sandbox 可用的只读 fs capability', async () => {
    const handler = new InitializeHandler();

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities: {
          fs: {
            readTextFile: true,
            writeTextFile: true,
          },
        },
      },
      {
        initialized: false,
      },
    );

    expect(result.serverInfo.capabilities).toEqual({
      loadSession: true,
      streaming: true,
      tools: true,
      fs: {
        readTextFile: true,
        writeTextFile: false,
      },
    });
  });

  it('应在 client 未声明 fs capability 时仍按真实服务能力返回 canonical fs capability', async () => {
    const handler = new InitializeHandler();

    const result = await handler.handle(
      {
        protocolVersion: '2026-02-18',
        clientCapabilities: {
          sampling: false,
        },
      },
      {
        initialized: false,
        requestClient: vi.fn(),
      },
    );

    expect(result.serverInfo.capabilities).toEqual({
      loadSession: true,
      streaming: true,
      tools: true,
      fs: {
        readTextFile: true,
        writeTextFile: true,
      },
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
