import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AgentRuntimeConfigSchema } from '@agentloom/contracts';
import { describe, expect, it } from 'vitest';

import {
  normalizeAgentCanvasRuntimeConfigAliases,
  normalizeAgentRuntimeConfig,
} from './agent-runtime-config-normalize.util';

const baseConfig = {
  runtimeMode: 'sandbox',
  modelConfig: { modelId: 'model-primary' },
} as const;

describe('normalizeAgentRuntimeConfig', () => {
  it('应归一知识库检索阈值旧别名', () => {
    const normalized = normalizeAgentRuntimeConfig({
      ...baseConfig,
      knowledgeBindings: [
        {
          knowledgeBaseId: 'kb-1',
          scoreThreshold: 0.72,
          enabled: true,
        },
      ],
    });

    expect(normalized.knowledgeBindings).toEqual([
      {
        knowledgeBaseId: 'kb-1',
        similarityThreshold: 0.72,
        enabled: true,
      },
    ]);
  });

  it('应将路由 fallbackChain 归一为候选列表和末项回退模型', () => {
    const normalized = normalizeAgentRuntimeConfig({
      ...baseConfig,
      routingConfig: {
        strategy: 'FALLBACK_CHAIN',
        fallbackChain: ['model-a', 'model-b'],
      },
    });

    expect(normalized.routingConfig).toEqual({
      strategy: 'FALLBACK_CHAIN',
      candidateModelIds: ['model-a', 'model-b'],
      fallbackModelId: 'model-b',
    });
  });

  it('应归一 sandbox 资源限制旧别名', () => {
    const normalized = normalizeAgentRuntimeConfig({
      ...baseConfig,
      sandboxConfig: {
        cpuLimit: 2,
        memoryLimitMb: 1536,
        disk: 4,
        timeout: 2,
      },
    });

    expect(normalized.sandboxConfig).toEqual({
      cpu: 2,
      memory: 1536,
      disk: 4,
      timeout: 2,
    });
  });

  it('canonical 与旧别名共存时应保留 canonical 值', () => {
    const normalized = normalizeAgentRuntimeConfig({
      ...baseConfig,
      knowledgeBindings: [
        {
          knowledgeBaseId: 'kb-1',
          similarityThreshold: 0.9,
          scoreThreshold: 0.1,
          enabled: true,
        },
      ],
      routingConfig: {
        strategy: 'FALLBACK_CHAIN',
        candidateModelIds: ['canonical-candidate'],
        fallbackModelId: 'canonical-fallback',
        fallbackChain: ['legacy-a', 'legacy-b'],
      },
      sandboxConfig: {
        cpu: 3,
        cpuLimit: 1,
        memory: 2048,
        memoryLimitMb: 512,
        disk: 5,
        timeout: 3,
      },
    });

    expect(normalized.knowledgeBindings?.[0]?.similarityThreshold).toBe(0.9);
    expect(normalized.routingConfig).toEqual({
      strategy: 'FALLBACK_CHAIN',
      candidateModelIds: ['canonical-candidate'],
      fallbackModelId: 'canonical-fallback',
    });
    expect(normalized.sandboxConfig).toMatchObject({ cpu: 3, memory: 2048 });
  });

  it('canonical 配置应幂等且通过 contracts schema 校验', () => {
    const canonical = {
      ...baseConfig,
      knowledgeBindings: [
        {
          knowledgeBaseId: 'kb-1',
          similarityThreshold: 0.8,
          enabled: true,
        },
      ],
      routingConfig: {
        strategy: 'FALLBACK_CHAIN',
        candidateModelIds: ['model-a'],
        fallbackModelId: 'model-b',
      },
      sandboxConfig: {
        cpu: 2,
        memory: 1024,
        disk: 3,
        timeout: 2,
      },
    };

    const normalized = normalizeAgentRuntimeConfig(canonical);
    expect(normalized).toEqual(canonical);
    expect(normalizeAgentRuntimeConfig(normalized)).toEqual(normalized);
    expect(() => AgentRuntimeConfigSchema.parse(normalized)).not.toThrow();
  });

  it('contracts fixture 已是 canonical，归一后应保持等价', () => {
    const fixturePath = resolve(
      process.cwd(),
      '../agentloom-contracts/fixtures/agent-runtime-config.json',
    );
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

    expect(normalizeAgentRuntimeConfig(fixture)).toEqual(fixture);
  });
});

describe('normalizeAgentCanvasRuntimeConfigAliases', () => {
  it('应清理保存画布节点 data.config 中的旧别名且不修改原对象', () => {
    const nodes = [
      {
        id: 'knowledge',
        type: 'knowledge-base',
        data: { config: { scoreThreshold: 0.7 } },
      },
      {
        id: 'routing',
        type: 'smart-routing',
        data: { config: { fallbackChain: ['model-a', 'model-b'] } },
      },
      {
        id: 'sandbox',
        type: 'sandbox',
        data: { config: { cpuLimit: 2, memoryLimitMb: 1024 } },
      },
    ];

    const normalized = normalizeAgentCanvasRuntimeConfigAliases(nodes);

    expect(normalized).toEqual([
      {
        id: 'knowledge',
        type: 'knowledge-base',
        data: { config: { similarityThreshold: 0.7 } },
      },
      {
        id: 'routing',
        type: 'smart-routing',
        data: {
          config: {
            candidateModelIds: ['model-a', 'model-b'],
            fallbackModelId: 'model-b',
          },
        },
      },
      {
        id: 'sandbox',
        type: 'sandbox',
        data: { config: { cpu: 2, memory: 1024 } },
      },
    ]);
    expect(nodes[0]?.data.config).toEqual({ scoreThreshold: 0.7 });
  });
});
