import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../database.module';
import type { WorkflowInputSchema } from '../../modules/workflow/dto/workflow-input-schema.dto';
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

const DEFAULT_TEMPLATE_VIEWPORT: TemplateDefinition['viewport'] = {
  x: 0,
  y: 0,
  zoom: 1,
};

const dailyCompetitorAnalysisInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'topic',
      type: 'text',
      label: '分析主题',
      required: true,
      validation: { maxLength: 200 },
    },
    {
      id: 'depth',
      type: 'single_select',
      label: '分析深度',
      required: true,
      options: ['浅度', '中度', '深度'],
    },
    {
      id: 'output_format',
      type: 'multi_select',
      label: '输出格式',
      required: false,
      options: ['文本', '表格', '图表'],
    },
    {
      id: 'max_iterations',
      type: 'number',
      label: '最大迭代次数',
      required: false,
      validation: { min: 1, max: 10 },
      default: 3,
    },
  ],
};

const customerFeedbackClassifierInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'feedback_text',
      type: 'text',
      label: '客户反馈内容',
      required: true,
      validation: { minLength: 5, maxLength: 2000 },
    },
    {
      id: 'channel',
      type: 'single_select',
      label: '反馈渠道',
      required: false,
      options: ['工单', '邮件', '应用内反馈', '社交媒体'],
    },
    {
      id: 'focus_topics',
      type: 'multi_select',
      label: '重点关注主题',
      required: false,
      options: ['功能需求', '易用性', '性能', '稳定性', '定价'],
    },
  ],
};

const techBlogWriterInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'topic',
      type: 'text',
      label: '博客主题',
      required: true,
      validation: { maxLength: 150 },
    },
    {
      id: 'audience_level',
      type: 'single_select',
      label: '目标读者层级',
      required: true,
      options: ['入门', '进阶', '专家'],
    },
    {
      id: 'target_length',
      type: 'number',
      label: '目标字数',
      required: false,
      validation: { min: 800, max: 5000 },
      default: 1800,
    },
    {
      id: 'sections',
      type: 'multi_select',
      label: '需要包含的章节',
      required: false,
      options: ['背景介绍', '原理分析', '代码示例', '最佳实践', '常见误区'],
    },
  ],
};

const codeReviewAssistantInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'code_snippet',
      type: 'text',
      label: '待审查代码',
      required: true,
      validation: { minLength: 20, maxLength: 8000 },
    },
    {
      id: 'language',
      type: 'single_select',
      label: '编程语言',
      required: true,
      options: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'Rust'],
    },
    {
      id: 'review_focus',
      type: 'multi_select',
      label: '审查重点',
      required: false,
      options: ['安全', '性能', '可维护性', '测试覆盖', '代码规范'],
    },
    {
      id: 'severity_threshold',
      type: 'number',
      label: '问题输出阈值',
      required: false,
      validation: { min: 1, max: 5 },
      default: 3,
    },
  ],
};

const autoDataReportInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'data_source',
      type: 'text',
      label: '数据源描述',
      required: true,
      validation: { maxLength: 500 },
    },
    {
      id: 'report_period',
      type: 'single_select',
      label: '报表周期',
      required: true,
      options: ['日报', '周报', '月报', '季度报表'],
    },
    {
      id: 'metrics',
      type: 'multi_select',
      label: '关键指标',
      required: true,
      options: ['营收', '活跃用户', '转化率', '留存率', '异常波动'],
    },
    {
      id: 'chart_count',
      type: 'number',
      label: '图表数量上限',
      required: false,
      validation: { min: 1, max: 8 },
      default: 3,
    },
  ],
};

const dailyCompetitorAnalysis: NewWorkflowTemplate = {
  slug: 'daily-competitor-analysis',
  name: '每日竞品分析',
  description:
    '自动抓取竞品动态，通过 LLM 分析市场趋势并汇总为结构化报告，帮助团队快速掌握竞争格局。使用前需为每个 Agent 节点选择一个已发布的 Agent Definition。',
  category: 'analysis',
  tags: ['竞品分析', '市场洞察', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    inputSchema: dailyCompetitorAnalysisInputSchema,
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        position: { x: -220, y: 0 },
        data: {
          label: '竞品信息采集提示词',
          config: {
            text: '你是一个竞品分析专家。根据给定的竞品列表，收集并整理最新的产品动态、定价变化和市场活动。',
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 100, y: 0 },
        data: { label: '竞品信息采集 Agent', config: {} },
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
      {
        id: 'e-prompt-1',
        source: 'prompt-1',
        target: 'agent-1',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      { id: 'e1', source: 'agent-1', target: 'llm-1' },
      { id: 'e2', source: 'llm-1', target: 'output-1' },
    ],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 120,
    complexity: 'intermediate',
    node_count: 4,
    required_capabilities: ['agent-definition'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 0,
};

const customerFeedbackClassifier: NewWorkflowTemplate = {
  slug: 'customer-feedback-classifier',
  name: '客户反馈智能分类',
  description:
    '将客户反馈自动分类为正面、负面或中性，同时提取关键主题和情感倾向，助力产品决策。使用前需为每个 Agent 节点选择一个已发布的 Agent Definition。',
  category: 'analysis',
  tags: ['客户反馈', '情感分析', 'beginner'],
  thumbnailUrl: null,
  definition: {
    inputSchema: customerFeedbackClassifierInputSchema,
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        position: { x: -120, y: 0 },
        data: {
          label: '反馈分类提示词',
          config: {
            text: '你是一个客户反馈分析专家。对输入的客户反馈进行情感分类（正面/负面/中性），提取关键主题，并输出结构化分类结果。',
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 200, y: 0 },
        data: { label: '反馈分类 Agent', config: {} },
      },
      {
        id: 'output-1',
        type: 'json-output',
        position: { x: 200, y: 200 },
        data: { label: '分类结果', portType: 'json' },
      },
    ],
    edges: [
      {
        id: 'e-prompt-1',
        source: 'prompt-1',
        target: 'agent-1',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      { id: 'e1', source: 'agent-1', target: 'output-1' },
    ],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 30,
    complexity: 'beginner',
    node_count: 3,
    required_capabilities: ['agent-definition'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 1,
};

const techBlogWriter: NewWorkflowTemplate = {
  slug: 'tech-blog-writer',
  name: '技术博客创作工作流',
  description:
    '从选题到发布的完整内容创作流水线：选题 Agent 确定方向、研究 Agent 收集素材、写作 Agent 生成初稿、审校 Agent 润色终稿。使用前需为每个 Agent 节点选择一个已发布的 Agent Definition。',
  category: 'content',
  tags: ['内容创作', '博客写作', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    inputSchema: techBlogWriterInputSchema,
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        position: { x: -120, y: 0 },
        data: {
          label: '选题提示词',
          config: {
            text: '你是一个技术内容策划专家。根据给定的技术领域，生成 3-5 个有吸引力的博客选题，包含标题、目标读者和预期要点。',
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 200, y: 0 },
        data: { label: '选题 Agent', config: {} },
      },
      {
        id: 'prompt-2',
        type: 'text',
        position: { x: -120, y: 200 },
        data: {
          label: '研究提示词',
          config: {
            text: '你是一个技术研究员。根据选定的博客主题，整理相关的技术概念、最佳实践和代码示例，为写作提供素材。',
          },
        },
      },
      {
        id: 'agent-2',
        type: 'agent',
        position: { x: 200, y: 200 },
        data: { label: '研究 Agent', config: {} },
      },
      {
        id: 'prompt-3',
        type: 'text',
        position: { x: -120, y: 400 },
        data: {
          label: '写作提示词',
          config: {
            text: '你是一个技术写作专家。基于研究素材撰写一篇结构清晰、深入浅出的技术博客文章。',
          },
        },
      },
      {
        id: 'agent-3',
        type: 'agent',
        position: { x: 200, y: 400 },
        data: { label: '写作 Agent', config: {} },
      },
      {
        id: 'prompt-4',
        type: 'text',
        position: { x: -120, y: 600 },
        data: {
          label: '审校提示词',
          config: {
            text: '你是一个技术编辑。审查文章的技术准确性、文字质量和结构完整性，输出最终润色版本。',
          },
        },
      },
      {
        id: 'agent-4',
        type: 'agent',
        position: { x: 200, y: 600 },
        data: { label: '审校 Agent', config: {} },
      },
    ],
    edges: [
      {
        id: 'e-prompt-1',
        source: 'prompt-1',
        target: 'agent-1',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-2',
        source: 'prompt-2',
        target: 'agent-2',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-3',
        source: 'prompt-3',
        target: 'agent-3',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-4',
        source: 'prompt-4',
        target: 'agent-4',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-2', target: 'agent-3' },
      { id: 'e3', source: 'agent-3', target: 'agent-4' },
    ],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 300,
    complexity: 'intermediate',
    node_count: 8,
    required_capabilities: ['agent-definition'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 2,
};

const codeReviewAssistant: NewWorkflowTemplate = {
  slug: 'code-review-assistant',
  name: '代码审查助手',
  description:
    '多 Agent 并行审查代码：安全性检查、性能分析、代码规范检查同步进行，最后由汇总 Agent 生成综合审查报告。使用前需为每个 Agent 节点选择一个已发布的 Agent Definition。',
  category: 'development',
  tags: ['代码审查', '质量保证', 'advanced'],
  thumbnailUrl: null,
  definition: {
    inputSchema: codeReviewAssistantInputSchema,
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        position: { x: -320, y: 0 },
        data: {
          label: '代码输入处理提示词',
          config: {
            text: '接收代码输入，提取关键信息（语言、框架、文件结构），并分发给各审查 Agent。',
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 300, y: 0 },
        data: { label: '代码输入处理', config: {} },
      },
      {
        id: 'prompt-2',
        type: 'text',
        position: { x: -320, y: 160 },
        data: {
          label: '安全审查提示词',
          config: {
            text: '你是安全专家。检查代码中的安全漏洞、注入风险、敏感数据泄露和不安全的依赖。',
          },
        },
      },
      {
        id: 'agent-2',
        type: 'agent',
        position: { x: 0, y: 200 },
        data: { label: '安全审查 Agent', config: {} },
      },
      {
        id: 'prompt-3',
        type: 'text',
        position: { x: -320, y: 320 },
        data: {
          label: '性能审查提示词',
          config: {
            text: '你是性能优化专家。分析代码中的性能瓶颈、内存泄漏风险和可优化的算法。',
          },
        },
      },
      {
        id: 'agent-3',
        type: 'agent',
        position: { x: 300, y: 200 },
        data: { label: '性能审查 Agent', config: {} },
      },
      {
        id: 'prompt-4',
        type: 'text',
        position: { x: -320, y: 480 },
        data: {
          label: '规范审查提示词',
          config: {
            text: '你是代码规范专家。检查代码风格一致性、命名规范、注释完整性和设计模式合理性。',
          },
        },
      },
      {
        id: 'agent-4',
        type: 'agent',
        position: { x: 600, y: 200 },
        data: { label: '规范审查 Agent', config: {} },
      },
      {
        id: 'prompt-5',
        type: 'text',
        position: { x: -320, y: 640 },
        data: {
          label: '汇总提示词',
          config: {
            text: '汇总所有审查结果，按严重程度排序，生成包含具体修改建议的综合代码审查报告。',
          },
        },
      },
      {
        id: 'agent-5',
        type: 'agent',
        position: { x: 300, y: 400 },
        data: { label: '汇总 Agent', config: {} },
      },
    ],
    edges: [
      {
        id: 'e-prompt-1',
        source: 'prompt-1',
        target: 'agent-1',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-2',
        source: 'prompt-2',
        target: 'agent-2',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-3',
        source: 'prompt-3',
        target: 'agent-3',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-4',
        source: 'prompt-4',
        target: 'agent-4',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-5',
        source: 'prompt-5',
        target: 'agent-5',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-1', target: 'agent-3' },
      { id: 'e3', source: 'agent-1', target: 'agent-4' },
      { id: 'e4', source: 'agent-2', target: 'agent-5' },
      { id: 'e5', source: 'agent-3', target: 'agent-5' },
      { id: 'e6', source: 'agent-4', target: 'agent-5' },
    ],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 180,
    complexity: 'advanced',
    node_count: 10,
    required_capabilities: ['agent-definition'],
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 3,
};

const autoDataReport: NewWorkflowTemplate = {
  slug: 'auto-data-report',
  name: '数据报表自动生成',
  description:
    '从数据源提取信息，通过分析 Agent 处理数据趋势，生成图表描述，最终输出完整的数据分析报告。使用前需为每个 Agent 节点选择一个已发布的 Agent Definition。',
  category: 'reporting',
  tags: ['数据分析', '报表生成', 'intermediate'],
  thumbnailUrl: null,
  definition: {
    inputSchema: autoDataReportInputSchema,
    nodes: [
      {
        id: 'prompt-1',
        type: 'text',
        position: { x: -120, y: 0 },
        data: {
          label: '数据源提示词',
          config: {
            text: '你是数据工程师。从给定的数据源描述中提取关键数据指标，整理为结构化数据集。',
          },
        },
      },
      {
        id: 'agent-1',
        type: 'agent',
        position: { x: 200, y: 0 },
        data: { label: '数据源 Agent', config: {} },
      },
      {
        id: 'prompt-2',
        type: 'text',
        position: { x: -120, y: 200 },
        data: {
          label: '分析提示词',
          config: {
            text: '你是数据分析师。对数据集进行趋势分析、异常检测和关键指标计算，输出分析结论。',
          },
        },
      },
      {
        id: 'agent-2',
        type: 'agent',
        position: { x: 200, y: 200 },
        data: { label: '分析 Agent', config: {} },
      },
      {
        id: 'prompt-3',
        type: 'text',
        position: { x: -120, y: 400 },
        data: {
          label: '图表描述提示词',
          config: {
            text: '基于分析结论，生成适合的图表类型建议和图表数据描述（柱状图、折线图、饼图等）。',
          },
        },
      },
      {
        id: 'agent-3',
        type: 'agent',
        position: { x: 200, y: 400 },
        data: { label: '图表描述生成', config: {} },
      },
      {
        id: 'output-1',
        type: 'text-output',
        position: { x: 200, y: 600 },
        data: { label: '报告输出', portType: 'text' },
      },
    ],
    edges: [
      {
        id: 'e-prompt-1',
        source: 'prompt-1',
        target: 'agent-1',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-2',
        source: 'prompt-2',
        target: 'agent-2',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      {
        id: 'e-prompt-3',
        source: 'prompt-3',
        target: 'agent-3',
        sourceHandle: 'text-out',
        targetHandle: 'system-prompt-in',
      },
      { id: 'e1', source: 'agent-1', target: 'agent-2' },
      { id: 'e2', source: 'agent-2', target: 'agent-3' },
      { id: 'e3', source: 'agent-3', target: 'output-1' },
    ],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  } satisfies TemplateDefinition,
  metadata: {
    author: 'AgentLoom',
    version: '1.0.0',
    estimated_runtime_seconds: 240,
    complexity: 'intermediate',
    node_count: 7,
    required_capabilities: ['agent-definition'],
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
