import { describe, expect, it } from 'vitest';

import {
  appendOutputSchemaToSystemPrompt,
  coerceAgentOutputSchema,
  mergeRuntimeConfigWithSubAgentRef,
  resolveSubAgentSystemPrompt,
} from './agent-runtime-config.utils';

describe('agent-runtime-config.utils', () => {
  it('coerceAgentOutputSchema 应接受对象与 JSON 字符串', () => {
    expect(coerceAgentOutputSchema({ type: 'object', properties: {} })).toEqual(
      {
        type: 'object',
        properties: {},
      },
    );

    expect(
      coerceAgentOutputSchema(
        '{"type":"object","properties":{"ok":{"type":"boolean"}}}',
      ),
    ).toEqual({
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    });

    expect(coerceAgentOutputSchema('not json')).toBeUndefined();
  });

  it('mergeRuntimeConfigWithSubAgentRef 应应用局部覆盖与扩展', () => {
    const merged = mergeRuntimeConfigWithSubAgentRef(
      {
        modelConfig: { modelId: 'base-model' },
        tools: [
          {
            toolType: 'mcp',
            toolId: 'base-tool',
            name: 'base-search',
            enabled: true,
            mcpServerConfigId: 'server-a',
            toolName: 'search',
          },
        ],
        knowledgeBindings: [
          {
            knowledgeBaseId: 'kb-base',
            enabled: true,
          },
        ],
        memoryInstanceIds: ['memory-base'],
        skillIds: ['skill-base'],
      },
      {
        agentDefinitionId: 'child-agent',
        alias: 'writer',
        overrides: {
          systemPrompt: '你是子代理',
          modelConfig: { modelId: 'override-model' },
          outputSchema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
          },
        },
        extensions: {
          tools: [
            {
              toolType: 'mcp',
              toolId: 'extra-tool',
              name: 'extra-search',
              enabled: true,
              mcpServerConfigId: 'server-b',
              toolName: 'search_news',
            },
          ],
          knowledgeBindings: [
            {
              knowledgeBaseId: 'kb-extra',
              enabled: true,
            },
          ],
          subAgents: [
            {
              agentDefinitionId: 'grand-child',
              alias: 'critic',
            },
          ],
          memoryInstanceIds: ['memory-extra'],
          skillIds: ['skill-extra'],
        },
      },
    );

    expect(merged.modelConfig).toEqual({ modelId: 'override-model' });
    expect(merged.outputSchema).toEqual({
      type: 'object',
      properties: { ok: { type: 'boolean' } },
    });
    expect(merged.tools).toHaveLength(2);
    expect(merged.knowledgeBindings).toHaveLength(2);
    expect(merged.subAgents).toEqual([
      {
        agentDefinitionId: 'grand-child',
        alias: 'critic',
      },
    ]);
    expect(merged.memoryInstanceIds).toEqual(['memory-base', 'memory-extra']);
    expect(merged.skillIds).toEqual(['skill-base', 'skill-extra']);
  });

  it('resolveSubAgentSystemPrompt 与 appendOutputSchemaToSystemPrompt 应生成最终提示词', () => {
    const overriddenPrompt = resolveSubAgentSystemPrompt('base prompt', {
      agentDefinitionId: 'child-agent',
      alias: 'writer',
      overrides: {
        systemPrompt: 'override prompt',
      },
    });

    expect(overriddenPrompt).toBe('override prompt');
    expect(
      appendOutputSchemaToSystemPrompt(overriddenPrompt, {
        type: 'object',
        properties: { summary: { type: 'string' } },
      }),
    ).toContain('You MUST return valid JSON matching this schema');
  });
});
