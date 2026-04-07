import { describe, expect, it } from 'vitest';

import {
  extractMcpToolDescriptors,
  resolveMcpServerConfigId,
} from './mcp-tool-descriptor.utils';

describe('mcp-tool-descriptor utils', () => {
  it('应从 enabledToolIds + tools[] 中提取已选 MCP 工具描述符', () => {
    const descriptors = extractMcpToolDescriptors({
      mcpServerConfigId: 'cfg-websearch',
      enabledToolIds: ['tool-fast'],
      tools: [
        {
          id: 'tool-fast',
          name: 'fast_search',
          mcpServerConfigId: 'cfg-websearch',
          inputSchema: { type: 'object' },
          portMappingMetadata: {
            inputs: [{ name: 'query', dataType: 'text' }],
            outputs: [{ name: 'result', dataType: 'json' }],
          },
        },
        {
          id: 'tool-deep',
          name: 'deep_search',
          mcpServerConfigId: 'cfg-websearch',
        },
      ],
    });

    expect(descriptors).toEqual([
      {
        mcpServerConfigId: 'cfg-websearch',
        toolName: 'fast_search',
        mcpToolDefinitionId: 'tool-fast',
        inputSchema: { type: 'object' },
        portMapping: {
          inputs: [{ name: 'query', dataType: 'text' }],
          outputs: [{ name: 'result', dataType: 'json' }],
        },
      },
    ]);
  });

  it('应兼容 legacy mcpServerId 字段名', () => {
    expect(
      resolveMcpServerConfigId({
        mcpServerId: 'cfg-legacy',
      }),
    ).toBe('cfg-legacy');
  });

  it('tools[] 为空时应回退到顶层 mcpServerConfigId + toolName', () => {
    const descriptors = extractMcpToolDescriptors({
      mcpServerConfigId: 'cfg-fallback',
      toolName: 'search_docs',
      inputSchema: { type: 'object' },
    });

    expect(descriptors).toEqual([
      {
        mcpServerConfigId: 'cfg-fallback',
        toolName: 'search_docs',
        inputSchema: { type: 'object' },
      },
    ]);
  });
});
