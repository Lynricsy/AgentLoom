import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../database.module';
import {
  workflowTemplates,
  type TemplateDefinition,
  type TemplateMetadata,
  type NewWorkflowTemplate,
} from '../schema';

// ──────────────────────────────────────────────
// 模板分类常量（与 DTO 枚举保持一致）
// ──────────────────────────────────────────────
export const TEMPLATE_CATEGORIES = [
  'analysis',
  'content',
  'development',
  'automation',
  'reporting',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

const dailyCompetitorAnalysis: NewWorkflowTemplate = {
  slug: 'daily-competitor-analysis',
  name: '每日竞品分析',
  description:
    '自动抓取竞品动态，通过 LLM 分析市场趋势并汇总为结构化报告，帮助团队快速掌握竞争格局。',
  category: 'analysis',
  tags: ['竞品分析', '市场洞察', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 100, y: 0 },
        data: {
          label: '竞品信息采集 Agent',
          systemPrompt:
            '你是一个竞品分析专家。根据给定的竞品列表，收集并整理最新的产品动态、定价变化和市场活动。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'llm-1',
        type: 'llm-model',
        position: { x: 100, y: 200 },
        data: {
          label: '趋势分析 LLM',
          systemPrompt:
            '根据采集到的竞品信息，分析市场趋势、竞争态势和潜在机会，输出结构化分析报告。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'output-1',
        type: 'text-output',
        position: { x: 100, y: 400 },
        data: { label: '分析报告汇总', portType: 'text' },
      },
    ],
    edges: [
      { id: 'e1', source: 'agent-1', target: 'llm-1' },
      { id: 'e2', source: 'llm-1', target: 'output-1' },
    ],
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 120,
    complexity: 'intermediate',
    node_count: 3,
    required_capabilities: ['llm'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 0,
};

const customerFeedbackClassifier: NewWorkflowTemplate = {
  slug: 'customer-feedback-classifier',
  name: '客户反馈智能分类',
  description:
    '将客户反馈自动分类为正面、负面或中性，同时提取关键主题和情感倾向，助力产品决策。',
  category: 'analysis',
  tags: ['客户反馈', '情感分析', 'beginner'],
  thumbnailUrl: null,
  definition: {
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 200, y: 0 },
        data: {
          label: '反馈分类 Agent',
          systemPrompt:
            '你是一个客户反馈分析专家。对输入的客户反馈进行情感分类（正面/负面/中性），提取关键主题，并输出结构化分类结果。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'output-1',
        type: 'json-output',
        position: { x: 200, y: 200 },
        data: { label: '分类结果', portType: 'json' },
      },
    ],
    edges: [{ id: 'e1', source: 'agent-1', target: 'output-1' }],
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 30,
    complexity: 'beginner',
    node_count: 2,
    required_capabilities: ['llm'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 1,
};

const techBlogWriter: NewWorkflowTemplate = {
  slug: 'tech-blog-writer',
  name: '技术博客创作工作流',
  description:
    '从选题到发布的完整内容创作流水线：选题 Agent 确定方向、研究 Agent 收集素材、写作 Agent 生成初稿、审校 Agent 润色终稿。',
  category: 'content',
  tags: ['内容创作', '博客写作', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 200, y: 0 },
        data: {
          label: '选题 Agent',
          systemPrompt:
            '你是一个技术内容策划专家。根据给定的技术领域，生成 3-5 个有吸引力的博客选题，包含标题、目标读者和预期要点。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-2',
        type: 'llm-agent',
        position: { x: 200, y: 200 },
        data: {
          label: '研究 Agent',
          systemPrompt:
            '你是一个技术研究员。根据选定的博客主题，整理相关的技术概念、最佳实践和代码示例，为写作提供素材。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-3',
        type: 'llm-agent',
        position: { x: 200, y: 400 },
        data: {
          label: '写作 Agent',
          systemPrompt:
            '你是一个技术写作专家。基于研究素材撰写一篇结构清晰、深入浅出的技术博客文章。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-4',
        type: 'llm-agent',
        position: { x: 200, y: 600 },
        data: {
          label: '审校 Agent',
          systemPrompt:
            '你是一个技术编辑。审查文章的技术准确性、文字质量和结构完整性，输出最终润色版本。',
          model: '__CONFIGURE_MODEL__',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-2', target: 'agent-3' },
      { id: 'e3', source: 'agent-3', target: 'agent-4' },
    ],
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 300,
    complexity: 'intermediate',
    node_count: 4,
    required_capabilities: ['llm'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 2,
};

const codeReviewAssistant: NewWorkflowTemplate = {
  slug: 'code-review-assistant',
  name: '代码审查助手',
  description:
    '多 Agent 并行审查代码：安全性检查、性能分析、代码规范检查同步进行，最后由汇总 Agent 生成综合审查报告。',
  category: 'development',
  tags: ['代码审查', '质量保证', 'advanced'],
  thumbnailUrl: null,
  definition: {
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 300, y: 0 },
        data: {
          label: '代码输入处理',
          systemPrompt:
            '接收代码输入，提取关键信息（语言、框架、文件结构），并分发给各审查 Agent。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-2',
        type: 'llm-agent',
        position: { x: 0, y: 200 },
        data: {
          label: '安全审查 Agent',
          systemPrompt:
            '你是安全专家。检查代码中的安全漏洞、注入风险、敏感数据泄露和不安全的依赖。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-3',
        type: 'llm-agent',
        position: { x: 300, y: 200 },
        data: {
          label: '性能审查 Agent',
          systemPrompt:
            '你是性能优化专家。分析代码中的性能瓶颈、内存泄漏风险和可优化的算法。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-4',
        type: 'llm-agent',
        position: { x: 600, y: 200 },
        data: {
          label: '规范审查 Agent',
          systemPrompt:
            '你是代码规范专家。检查代码风格一致性、命名规范、注释完整性和设计模式合理性。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-5',
        type: 'llm-agent',
        position: { x: 300, y: 400 },
        data: {
          label: '汇总 Agent',
          systemPrompt:
            '汇总所有审查结果，按严重程度排序，生成包含具体修改建议的综合代码审查报告。',
          model: '__CONFIGURE_MODEL__',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-1', target: 'agent-3' },
      { id: 'e3', source: 'agent-1', target: 'agent-4' },
      { id: 'e4', source: 'agent-2', target: 'agent-5' },
      { id: 'e5', source: 'agent-3', target: 'agent-5' },
      { id: 'e6', source: 'agent-4', target: 'agent-5' },
    ],
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 180,
    complexity: 'advanced',
    node_count: 5,
    required_capabilities: ['llm'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 3,
};

const autoDataReport: NewWorkflowTemplate = {
  slug: 'auto-data-report',
  name: '数据报表自动生成',
  description:
    '从数据源提取信息，通过分析 Agent 处理数据趋势，生成图表描述，最终输出完整的数据分析报告。',
  category: 'reporting',
  tags: ['数据分析', '报表生成', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    nodes: [
      {
        id: 'agent-1',
        type: 'llm-agent',
        position: { x: 200, y: 0 },
        data: {
          label: '数据源 Agent',
          systemPrompt:
            '你是数据工程师。从给定的数据源描述中提取关键数据指标，整理为结构化数据集。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-2',
        type: 'llm-agent',
        position: { x: 200, y: 200 },
        data: {
          label: '分析 Agent',
          systemPrompt:
            '你是数据分析师。对数据集进行趋势分析、异常检测和关键指标计算，输出分析结论。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'agent-3',
        type: 'llm-agent',
        position: { x: 200, y: 400 },
        data: {
          label: '图表描述生成',
          systemPrompt:
            '基于分析结论，生成适合的图表类型建议和图表数据描述（柱状图、折线图、饼图等）。',
          model: '__CONFIGURE_MODEL__',
        },
      },
      {
        id: 'output-1',
        type: 'text-output',
        position: { x: 200, y: 600 },
        data: { label: '报告输出', portType: 'text' },
      },
    ],
    edges: [
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-2', target: 'agent-3' },
      { id: 'e3', source: 'agent-3', target: 'output-1' },
    ],
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 240,
    complexity: 'intermediate',
    node_count: 4,
    required_capabilities: ['llm'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 4,
};

export const TEMPLATE_SEEDS: NewWorkflowTemplate[] = [
  dailyCompetitorAnalysis,
  customerFeedbackClassifier,
  techBlogWriter,
  codeReviewAssistant,
  autoDataReport,
];

// ──────────────────────────────────────────────
// 种子执行函数 — upsert on slug conflict
// ──────────────────────────────────────────────
export async function seedTemplates(db: DrizzleDB): Promise<void> {
  for (const seed of TEMPLATE_SEEDS) {
    await db
      .insert(workflowTemplates)
      .values(seed)
      .onConflictDoUpdate({
        target: workflowTemplates.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          tags: sql`excluded.tags`,
          definition: sql`excluded.definition`,
          metadata: sql`excluded.metadata`,
          isPublished: sql`excluded.is_published`,
          displayOrder: sql`excluded.display_order`,
          updatedAt: sql`now()`,
        },
      });
  }
}
