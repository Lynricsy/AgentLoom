import { and, eq, inArray } from 'drizzle-orm';

import type { DrizzleDB } from '../database.module';
import {
  llmModelConfigs,
  llmProviders,
  routerModels,
  routingBenchmarks,
  ROUTING_BENCHMARK_TASK_CATEGORIES,
  type RoutingBenchmarkMlpWeights,
  type RoutingBenchmarkTaskCategory,
} from '../schema';
import { getModelRoutingMeta } from '../../modules/llm/llm-provider-catalog';

export const ROUTING_BENCHMARK_SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'deepseek',
] as const;

export type RoutingBenchmarkSupportedProvider =
  (typeof ROUTING_BENCHMARK_SUPPORTED_PROVIDERS)[number];

interface RoutingBenchmarkModelTarget {
  providerId: RoutingBenchmarkSupportedProvider;
  modelName: string;
}

interface RoutingBenchmarkSeedBlueprint {
  key: string;
  taskCategory: RoutingBenchmarkTaskCategory;
  providerId: RoutingBenchmarkSupportedProvider;
  modelName: string;
  queryText: string;
  queryEmbeddingId: string;
  performanceScore: string;
  tokenCount: number;
  latencyMs: number;
  mlpWeights: RoutingBenchmarkMlpWeights | null;
}

interface RouterModelSeedTarget {
  routerModelId: string;
  tenantId: string;
  providerId: string;
  modelName: string;
}

export interface RoutingBenchmarkSeedResult {
  synchronizedCount: number;
  matchedRouterModelCount: number;
  unmatchedModelKeys: string[];
}

const ROUTING_BENCHMARK_MODEL_ROTATION: RoutingBenchmarkModelTarget[] = [
  { providerId: 'openai', modelName: 'gpt-4o' },
  { providerId: 'anthropic', modelName: 'claude-sonnet-4-20250514' },
  { providerId: 'google', modelName: 'gemini-1.5-pro' },
  { providerId: 'deepseek', modelName: 'deepseek-reasoner' },
  { providerId: 'openai', modelName: 'o3-mini' },
  { providerId: 'anthropic', modelName: 'claude-3-5-haiku-20241022' },
  { providerId: 'google', modelName: 'gemini-2.0-flash' },
  { providerId: 'deepseek', modelName: 'deepseek-chat' },
  { providerId: 'openai', modelName: 'gpt-4o-mini' },
  { providerId: 'google', modelName: 'gemini-2.0-flash-lite' },
];

const TASK_CATEGORY_QUERIES: Record<RoutingBenchmarkTaskCategory, string[]> = {
  coding: [
    '重构一个 NestJS 服务以支持依赖注入边界，并补充失败重试单测。',
    '修复 React 表单在并发提交时的竞态条件，并解释为什么这样改。',
    '为一个 Drizzle schema 添加多租户 RLS 策略与迁移说明。',
    '实现一个带指数退避的 fetch 重试封装，要求类型安全。',
    '将一段同步文件处理逻辑改为流式处理，并给出性能收益分析。',
    '为 BullMQ worker 增加幂等保护，避免重复消费相同 job。',
    '编写一个 TypeScript 工具函数，把 snake_case API 响应转换为 camelCase。',
    '给现有 ACL 守卫增加缓存层，并写出失效策略。',
    '设计一个插件执行沙箱的超时与内存限制错误映射。',
    '实现一个支持分页和过滤的审计日志查询仓储方法。',
  ],
  reasoning: [
    '比较事件溯源与传统 CRUD 审计的权衡，并推荐在多租户 SaaS 中的选型。',
    '分析一个 DAG 调度器为什么会出现死锁，并提出最小修复方案。',
    '在高延迟模型与低成本模型之间做路由决策，给出可解释理由。',
    '解释为什么 append-only 审计日志更适合做合规保留。',
    '为一个在线学习路由器设计 OCC 并发控制策略。',
    '判断何时应把 provider 状态从 degraded 提升为 open，并说明阈值依据。',
    '分析为什么相同 prompt 在不同模型上性能差异显著。',
    '评估把 embedding 调用设置为 2000ms 超时的收益与风险。',
    '推导为什么某个 fallback 链在认证失败时不应继续切换模型。',
    '解释在路由记忆中同时保存 latency、token 和质量分数的意义。',
  ],
  creative: [
    '为一款 AI 工作流产品撰写富有说服力的上线公告。',
    '生成一段产品营销文案，强调多模型路由和可解释性优势。',
    '写一封面向企业客户的私有化部署邀请邮件。',
    '构思一个品牌故事，把 AgentLoom 比作编织智能协作网络。',
    '设计一个 onboarding 欢迎页文案，语气专业但友好。',
    '产出一组功能命名方案，突出监控、治理和审计闭环。',
    '为知识库检索功能写 5 条 CTA 文案备选。',
    '写一段应用内通知文案，提醒管理员关注异常执行治理。',
    '为开发者插件市场生成一段生态招募说明。',
    '围绕智能路由节点输出一段产品介绍视频脚本。',
  ],
  qa: [
    '为智能路由模块设计一组回归测试，覆盖 provider 降级与恢复。',
    '编写一个 E2E 场景，验证 tenant 边界下的 routing_decisions 查询。',
    '给路由器 registry 增加契约测试，确保未知策略被拒绝。',
    '设计针对 Qdrant collection 初始化脚本的 smoke test。',
    '为 benchmark seed 编写校验用例，确认 6 类任务都有覆盖。',
    '列出 provider health circuit breaker 的边界测试矩阵。',
    '验证 router_models 的 OCC 字段在并发更新时不会丢数据。',
    '为模型过滤逻辑补充 token 上限超界场景。',
    '检查智能路由 API 的分页与排序行为是否稳定。',
    '设计一条测试，证明认证失败不应触发 fallback chain。',
  ],
  math: [
    '估算一个 128k context 模型在 20k 输入 token 下的成本区间。',
    '根据 Elo 分数变化推导模型胜率，并解释更新方向。',
    '计算 4 个候选模型在加权评分后的最终排序。',
    '推导��线学习中小批量梯度更新的时间复杂度。',
    '分析一组 latency 样本的均值、中位数与 P95。',
    '在给定预算约束下，选择最优的模型组合策略。',
    '比较两个模型的单位 token 成本与吞吐收益。',
    '根据历史成功率和响应时间，计算综合评分。',
    '求解一个带 softmax 输出层的简单两层 MLP 前向结果。',
    '在固定 SLA 约束下估算 fallback chain 的最大平均耗时。',
  ],
  general: [
    '总结本周 AI 平台运行情况，突出成功执行率与成本变化。',
    '根据用户反馈整理 3 个最值得优先处理的问题。',
    '概括智能路由模块的核心价值，面向技术决策者。',
    '为运营团队生成一份简短的产品更新周报。',
    '解释什么是 Qdrant，以及它在路由记忆中的作用。',
    '对一段工作流执行日志做高层摘要。',
    '列出部署智能路由前需要确认的基础设施清单。',
    '给非技术同学解释多租户 RLS 的基本意义。',
    '为客服团队整理一个关于模型切换的 FAQ 回答。',
    '写一段 smart-routing 节点的帮助提示文案。',
  ],
};

const TASK_CATEGORY_MULTIPLIERS: Record<RoutingBenchmarkTaskCategory, number> =
  {
    coding: 1.03,
    reasoning: 1.05,
    creative: 0.96,
    qa: 0.94,
    math: 1.02,
    general: 0.98,
  };

const TASK_CATEGORY_BASE_TOKENS: Record<RoutingBenchmarkTaskCategory, number> =
  {
    coding: 1900,
    reasoning: 2200,
    creative: 1400,
    qa: 1200,
    math: 1800,
    general: 1100,
  };

const PROVIDER_TASK_BOOSTS: Record<
  RoutingBenchmarkTaskCategory,
  Partial<Record<RoutingBenchmarkSupportedProvider, number>>
> = {
  coding: { openai: 1.03, anthropic: 1.02, google: 0.98, deepseek: 1.01 },
  reasoning: { openai: 1.01, anthropic: 1.04, google: 0.97, deepseek: 1.03 },
  creative: { openai: 1.02, anthropic: 1.03, google: 0.99, deepseek: 0.97 },
  qa: { openai: 1.01, anthropic: 1.01, google: 1.0, deepseek: 0.99 },
  math: { openai: 1.02, anthropic: 0.98, google: 1.0, deepseek: 1.04 },
  general: { openai: 1.0, anthropic: 1.0, google: 1.01, deepseek: 0.99 },
};

function toModelKey(providerId: string, modelName: string): string {
  return `${providerId}::${modelName}`;
}

function buildPerformanceScore(
  taskCategory: RoutingBenchmarkTaskCategory,
  providerId: RoutingBenchmarkSupportedProvider,
  modelName: string,
  index: number,
): string {
  const meta = getModelRoutingMeta(providerId, modelName);
  const qualityFactor = meta.qualityRank / 100;
  const categoryMultiplier = TASK_CATEGORY_MULTIPLIERS[taskCategory];
  const providerBoost = PROVIDER_TASK_BOOSTS[taskCategory][providerId] ?? 1;
  const stabilityFactor = 1 - (index % 5) * 0.01;
  const score = Math.min(
    0.995,
    Math.max(
      0.55,
      qualityFactor * categoryMultiplier * providerBoost * stabilityFactor,
    ),
  );

  return score.toFixed(4);
}

function buildTokenCount(
  taskCategory: RoutingBenchmarkTaskCategory,
  queryText: string,
  index: number,
): number {
  return (
    TASK_CATEGORY_BASE_TOKENS[taskCategory] + queryText.length * 5 + index * 41
  );
}

function buildLatencyMs(
  taskCategory: RoutingBenchmarkTaskCategory,
  providerId: RoutingBenchmarkSupportedProvider,
  modelName: string,
  queryText: string,
  index: number,
): number {
  const meta = getModelRoutingMeta(providerId, modelName);
  const latencyMultiplier =
    taskCategory === 'reasoning' || taskCategory === 'math' ? 1.18 : 1.04;

  return Math.round(
    meta.avgLatencyMs * latencyMultiplier + queryText.length * 2 + index * 17,
  );
}

function buildMlpWeights(
  taskCategory: RoutingBenchmarkTaskCategory,
  providerId: RoutingBenchmarkSupportedProvider,
  modelName: string,
  index: number,
): RoutingBenchmarkMlpWeights | null {
  if (index % 2 !== 0) {
    return null;
  }

  const meta = getModelRoutingMeta(providerId, modelName);
  const normalizedQuality = Number((meta.qualityRank / 100).toFixed(4));
  const normalizedLatency = Number(
    (Math.min(meta.avgLatencyMs, 3000) / 3000).toFixed(4),
  );
  const categoryBias = Number(
    (TASK_CATEGORY_MULTIPLIERS[taskCategory] - 0.9).toFixed(4),
  );

  return {
    layers: [
      {
        weights: [
          [normalizedQuality, 0.12, -0.08],
          [0.09, Number((1 - normalizedLatency).toFixed(4)), 0.05],
        ],
        biases: [categoryBias, Number((index / 100).toFixed(4))],
      },
      {
        weights: [[0.72, 0.28]],
        biases: [
          Number((normalizedQuality - normalizedLatency / 2).toFixed(4)),
        ],
      },
    ],
    metadata: {
      trainedAt: '2026-03-22T00:00:00.000Z',
      sampleCount: 64 + index * 3,
      version: `seed-v1-${taskCategory}`,
    },
  };
}

function buildRoutingBenchmarkBlueprints(): RoutingBenchmarkSeedBlueprint[] {
  return ROUTING_BENCHMARK_TASK_CATEGORIES.flatMap((taskCategory) =>
    TASK_CATEGORY_QUERIES[taskCategory].map((queryText, index) => {
      const target = ROUTING_BENCHMARK_MODEL_ROTATION[index];

      return {
        key: `${taskCategory}-${index + 1}`,
        taskCategory,
        providerId: target.providerId,
        modelName: target.modelName,
        queryText,
        queryEmbeddingId: `routing-seed:${taskCategory}:${index + 1}:${target.providerId}`,
        performanceScore: buildPerformanceScore(
          taskCategory,
          target.providerId,
          target.modelName,
          index,
        ),
        tokenCount: buildTokenCount(taskCategory, queryText, index),
        latencyMs: buildLatencyMs(
          taskCategory,
          target.providerId,
          target.modelName,
          queryText,
          index,
        ),
        mlpWeights: buildMlpWeights(
          taskCategory,
          target.providerId,
          target.modelName,
          index,
        ),
      };
    }),
  );
}

export const ROUTING_BENCHMARK_SEED_BLUEPRINTS =
  buildRoutingBenchmarkBlueprints();

async function loadRouterModelTargets(
  db: DrizzleDB,
): Promise<RouterModelSeedTarget[]> {
  return db
    .select({
      routerModelId: routerModels.id,
      tenantId: routerModels.tenantId,
      providerId: llmProviders.slug,
      modelName: llmModelConfigs.modelId,
    })
    .from(routerModels)
    .innerJoin(llmModelConfigs, eq(routerModels.modelId, llmModelConfigs.id))
    .innerJoin(llmProviders, eq(llmModelConfigs.providerId, llmProviders.id))
    .where(inArray(llmProviders.slug, ROUTING_BENCHMARK_SUPPORTED_PROVIDERS));
}

export async function seedRoutingBenchmarks(
  db: DrizzleDB,
): Promise<RoutingBenchmarkSeedResult> {
  const routerModelTargets = await loadRouterModelTargets(db);
  const routerModelLookup = new Map<string, RouterModelSeedTarget[]>();

  for (const target of routerModelTargets) {
    const key = toModelKey(target.providerId, target.modelName);
    const existingTargets = routerModelLookup.get(key) ?? [];
    existingTargets.push(target);
    routerModelLookup.set(key, existingTargets);
  }

  if (routerModelTargets.length === 0) {
    console.warn(
      'No router_models rows matched supported providers; skipping routing benchmark seed.',
    );
    return {
      synchronizedCount: 0,
      matchedRouterModelCount: 0,
      unmatchedModelKeys: [
        ...new Set(
          ROUTING_BENCHMARK_MODEL_ROTATION.map((target) =>
            toModelKey(target.providerId, target.modelName),
          ),
        ),
      ],
    };
  }

  let synchronizedCount = 0;
  const unmatchedModelKeys = new Set<string>();

  for (const blueprint of ROUTING_BENCHMARK_SEED_BLUEPRINTS) {
    const routerModelMatches = routerModelLookup.get(
      toModelKey(blueprint.providerId, blueprint.modelName),
    );

    if (!routerModelMatches || routerModelMatches.length === 0) {
      unmatchedModelKeys.add(
        toModelKey(blueprint.providerId, blueprint.modelName),
      );
      continue;
    }

    for (const target of routerModelMatches) {
      await db
        .delete(routingBenchmarks)
        .where(
          and(
            eq(routingBenchmarks.modelId, target.routerModelId),
            eq(routingBenchmarks.queryEmbeddingId, blueprint.queryEmbeddingId),
          ),
        );

      await db.insert(routingBenchmarks).values({
        taskCategory: blueprint.taskCategory,
        queryText: blueprint.queryText,
        queryEmbeddingId: blueprint.queryEmbeddingId,
        modelId: target.routerModelId,
        performanceScore: blueprint.performanceScore,
        tokenCount: blueprint.tokenCount,
        latencyMs: blueprint.latencyMs,
        mlpWeights: blueprint.mlpWeights,
      });

      synchronizedCount += 1;
    }
  }

  return {
    synchronizedCount,
    matchedRouterModelCount: routerModelTargets.length,
    unmatchedModelKeys: [...unmatchedModelKeys].sort(),
  };
}
