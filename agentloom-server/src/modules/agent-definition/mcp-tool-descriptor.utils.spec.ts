import { describe, expect, it } from 'vitest';

import {
  extractMcpToolDescriptors,
  resolveMcpServerConfigId,
  validateMcpToolBinding,
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

  it('enabledToolIds 为空但 tools[] 已填写时应判定为缺少显式工具选择', () => {
    expect(
      validateMcpToolBinding({
        mcpServerConfigId: 'cfg-websearch',
        tools: [
          {
            id: 'tool-fast',
            name: 'fast_search',
            mcpServerConfigId: 'cfg-websearch',
          },
        ],
      }),
    ).toEqual({
      mcpServerConfigId: 'cfg-websearch',
      enabledToolIds: [],
      issues: ['enabledToolIds 为空，未显式选择具体工具'],
    });
  });

  it('enabledToolIds 与 tools[] 不一致时应返回缺失元数据的工具 id', () => {
    expect(
      validateMcpToolBinding({
        mcpServerConfigId: 'cfg-websearch',
        enabledToolIds: ['tool-fast', 'tool-deep'],
        tools: [
          {
            id: 'tool-fast',
            name: 'fast_search',
            mcpServerConfigId: 'cfg-websearch',
          },
        ],
      }),
    ).toEqual({
      mcpServerConfigId: 'cfg-websearch',
      enabledToolIds: ['tool-fast', 'tool-deep'],
      issues: ['enabledToolIds 中的 tool-deep 未在 tools[] 中提供元数据'],
      missingToolIds: ['tool-deep'],
    });
  });
});
