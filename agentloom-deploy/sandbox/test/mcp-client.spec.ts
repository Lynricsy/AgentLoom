import { describe, expect, it } from 'vitest';

import { normalizeBundledMcpServerConfig } from '../src/mcp-client.js';

describe('normalizeBundledMcpServerConfig', () => {
  it('应把 grok-search 的 npx 调用重写为本地二进制', () => {
    const normalized = normalizeBundledMcpServerConfig({
      transportType: 'stdio',
      command: 'npx',
      args: ['-y', 'grok-search@latest'],
    });

    expect(normalized.command).toContain('node_modules/.bin/grok-search');
    expect(normalized.args).toEqual([]);
  });

  it('不应改写非预装 MCP server 的 stdio 配置', () => {
    const original = {
      transportType: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/demo'],
    };

    const normalized = normalizeBundledMcpServerConfig(original);

    expect(normalized).toEqual(original);
  });
});
