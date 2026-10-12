import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../database.module';
import type { WorkflowInputSchema } from '../../modules/workflow/dto/workflow-input-schema.dto';
import {
  workflowTemplates,
  type NewWorkflowTemplate,
  type ReactFlowEdge,
  type ReactFlowNode,
  type TemplateDefinition,
  type TemplateMetadata,
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

// ──────────────────────────────────────────────
// 图构造：外层 type 是画布分组，真实节点类型写在 data.nodeType（与画布保存格式一致）
// ──────────────────────────────────────────────
type TemplateNodeType =
  | 'manual-trigger'
  | 'input-preprocessor'
  | 'text'
  | 'agent'
  | 'merge'
  | 'text-output'
  | 'json-output';

const TEMPLATE_NODE_CATEGORY: Record<TemplateNodeType, string> = {
  'manual-trigger': 'trigger',
  'input-preprocessor': 'tool',
  text: 'output',
  agent: 'agent',
  merge: 'control',
  'text-output': 'output',
  'json-output': 'output',
};

/** 列间距与行间距：节点卡宽约 260，留出连线空间 */
const COLUMN = 340;
const ROW = 260;

function templateNode(
  id: string,
  nodeType: TemplateNodeType,
  column: number,
  row: number,
  label: string,
  config: Record<string, unknown> = {},
  extraData: Record<string, unknown> = {},
): ReactFlowNode {
  return {
    id,
    type: TEMPLATE_NODE_CATEGORY[nodeType],
    position: { x: column * COLUMN, y: row * ROW },
    data: {
      label,
      nodeType,
      category: TEMPLATE_NODE_CATEGORY[nodeType],
      config,
      ...extraData,
    },
  };
}

function templateEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): ReactFlowEdge {
  return {
    id: `${source}:${sourceHandle}->${target}:${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

/**
 * 一个「角色提示词 + Agent」组合：文本节点连到 Agent 的 system-prompt-in。
 * Agent 节点不带绑定，从模板创建工作流时由服务端为当前租户生成并绑定已发布的 Agent。
 */
function promptedAgent(params: {
  id: string;
  label: string;
  prompt: string;
  column: number;
  row: number;
}): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  const promptId = `${params.id}-prompt`;
  return {
    nodes: [
      templateNode(
        promptId,
        'text',
        params.column - 0.35,
        params.row + 0.75,
        `${params.label} · 角色设定`,
        { text: params.prompt },
      ),
      templateNode(params.id, 'agent', params.column, params.row, params.label),
    ],
    edges: [templateEdge(promptId, 'text-out', params.id, 'system-prompt-in')],
  };
}

const TRIGGER_ID = 'trigger';
const INPUT_ID = 'compose-input';

/** 手动触发 + 把表单字段整理成一段任务说明的输入预处理（脚本最后一个表达式即输出文本） */
function triggerAndInput(script: string): {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
} {
  return {
    nodes: [
      templateNode(TRIGGER_ID, 'manual-trigger', 0, 0, '手动启动'),
      templateNode(INPUT_ID, 'input-preprocessor', 1, 0, '整理任务说明', {
        transformType: 'script',
        expression: script,
      }),
    ],
    edges: [templateEdge(TRIGGER_ID, 'payload-out', INPUT_ID, 'json-in')],
  };
}

function assembleDefinition(
  inputSchema: WorkflowInputSchema,
  parts: Array<{ nodes: ReactFlowNode[]; edges: ReactFlowEdge[] }>,
  extraEdges: ReactFlowEdge[],
): TemplateDefinition {
  return {
    inputSchema,
    nodes: parts.flatMap((part) => part.nodes),
    edges: [...parts.flatMap((part) => part.edges), ...extraEdges],
    viewport: DEFAULT_TEMPLATE_VIEWPORT,
  };
}

const TEMPLATE_AUTHOR = 'AgentLoom';
const TEMPLATE_REQUIREMENTS = ['chat-model'];

// ──────────────────────────────────────────────
// 每日竞品分析
// ──────────────────────────────────────────────
const dailyCompetitorAnalysisInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'topic',
      type: 'text',
      label: '分析主题',
      required: true,
      description: '例如：面向中小团队的 AI 编程助手',
      validation: { maxLength: 200 },
    },
    {
      id: 'competitors',
      type: 'text',
      label: '重点竞品（可选）',
      required: false,
      description: '用逗号分隔，例如：Cursor, GitHub Copilot, Windsurf',
      validation: { maxLength: 500 },
    },
    {
      id: 'depth',
      type: 'single_select',
      label: '分析深度',
      required: true,
      options: ['浅度', '中度', '深度'],
      default: '中度',
    },
    {
      id: 'output_format',
      type: 'multi_select',
      label: '报告呈现',
      required: false,
      options: ['要点摘要', '对比表格', '机会与风险清单'],
    },
  ],
};

const dailyCompetitorAnalysis: NewWorkflowTemplate = {
  slug: 'daily-competitor-analysis',
  name: '每日竞品分析',
  description:
    '填写分析主题与关注的竞品，竞品研究 Agent 梳理各家产品定位、定价与近期动作，趋势分析 Agent 提炼竞争格局、机会与风险，输出一份结构化竞品分析报告。可在画布上加定时触发器每天运行。',
  category: 'analysis',
  tags: ['竞品分析', '市场洞察', 'intermediate'],
  thumbnailUrl: '/covers/templates/daily-competitor-analysis.svg',
  definition: assembleDefinition(
    dailyCompetitorAnalysisInputSchema,
    [
      triggerAndInput(`const f = input['json-in'] || {};
const lines = ['分析主题：' + (f.topic || '未填写')];
if (f.competitors) lines.push('重点竞品：' + f.competitors);
lines.push('分析深度：' + (f.depth || '中度'));
const formats = Array.isArray(f.output_format) ? f.output_format : [];
if (formats.length) lines.push('报告需要包含：' + formats.join('、'));
lines.join('\\n');`),
      promptedAgent({
        id: 'research-agent',
        label: '竞品研究 Agent',
        prompt:
          '你是资深的行业研究员。根据任务说明里的主题与竞品清单（没有给出竞品时，自行选出该领域最有代表性的 3-5 家），逐家整理：产品定位与目标用户、核心功能与差异点、定价与商业模式、近一年值得注意的产品或市场动作。只写你有把握的事实，不确定的信息明确标注「待核实」。用 Markdown 分节输出，每家竞品一个小节。',
        column: 2,
        row: 0,
      }),
      promptedAgent({
        id: 'trend-agent',
        label: '趋势分析 Agent',
        prompt:
          '你是战略分析师。基于上游的竞品研究笔记和用户的分析要求（见附带的表单 JSON），输出最终报告：1) 一段 3-5 句的结论摘要；2) 竞争格局与各家所处位置；3) 关键趋势；4) 对我方的机会与风险，并给出可执行建议。按表单里的「分析深度」控制篇幅，按「报告需要包含」补充对比表格或清单。使用 Markdown。',
        column: 3,
        row: 0,
      }),
      {
        nodes: [templateNode('report', 'text-output', 4, 0, '竞品分析报告')],
        edges: [],
      },
    ],
    [
      templateEdge(INPUT_ID, 'text-out', 'research-agent', 'text-in'),
      templateEdge('research-agent', 'agent-out', 'trend-agent', 'text-in'),
      templateEdge(TRIGGER_ID, 'payload-out', 'trend-agent', 'context-in'),
      templateEdge('trend-agent', 'agent-out', 'report', 'content-in'),
    ],
  ),
  metadata: {
    author: TEMPLATE_AUTHOR,
    version: '2.0.0',
    estimated_runtime_seconds: 90,
    complexity: 'intermediate',
    node_count: 7,
    required_capabilities: TEMPLATE_REQUIREMENTS,
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 0,
};

// ──────────────────────────────────────────────
// 客户反馈智能分类
// ──────────────────────────────────────────────
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

const customerFeedbackClassifier: NewWorkflowTemplate = {
  slug: 'customer-feedback-classifier',
  name: '客户反馈智能分类',
  description:
    '把一条客户反馈分成正面、负面或中性，提取涉及的主题、紧急程度和建议的跟进动作，输出可直接接入工单或数据看板的 JSON。',
  category: 'analysis',
  tags: ['客户反馈', '情感分析', 'beginner'],
  thumbnailUrl: '/covers/templates/customer-feedback-classifier.svg',
  definition: assembleDefinition(
    customerFeedbackClassifierInputSchema,
    [
      triggerAndInput(`const f = input['json-in'] || {};
const lines = ['客户反馈：' + (f.feedback_text || '')];
if (f.channel) lines.push('反馈渠道：' + f.channel);
const topics = Array.isArray(f.focus_topics) ? f.focus_topics : [];
if (topics.length) lines.push('重点关注主题：' + topics.join('、'));
lines.join('\\n');`),
      promptedAgent({
        id: 'classifier-agent',
        label: '反馈分类 Agent',
        prompt:
          '你是客户体验分析专家。阅读客户反馈，只输出一个 JSON 对象，不要输出任何其他文字或代码块标记。字段：sentiment（"positive" | "negative" | "neutral"）、confidence（0-1 的数字）、topics（字符串数组，优先使用用户给出的重点关注主题）、urgency（"high" | "medium" | "low"）、summary（一句话中文概括）、suggested_action（一句话中文跟进建议）。',
        column: 2,
        row: 0,
      }),
      {
        nodes: [
          templateNode(
            'parse-json',
            'input-preprocessor',
            3,
            0,
            '解析分类结果',
            {
              transformType: 'script',
              // 模型偶尔会包一层代码块或多说一句话：取第一个 {...} 解析，失败时保留原文便于排查
              expression: `const raw = String(input['text-in'] || '');
const match = raw.match(/\\{[\\s\\S]*\\}/);
let parsed;
try { parsed = JSON.parse(match ? match[0] : raw); } catch (error) { parsed = { raw: raw }; }
parsed;`,
            },
          ),
          templateNode('result', 'json-output', 4, 0, '分类结果'),
        ],
        edges: [],
      },
    ],
    [
      templateEdge(INPUT_ID, 'text-out', 'classifier-agent', 'text-in'),
      templateEdge('classifier-agent', 'agent-out', 'parse-json', 'text-in'),
      templateEdge('parse-json', 'json-out', 'result', 'content-in'),
    ],
  ),
  metadata: {
    author: TEMPLATE_AUTHOR,
    version: '2.0.0',
    estimated_runtime_seconds: 30,
    complexity: 'beginner',
    node_count: 6,
    required_capabilities: TEMPLATE_REQUIREMENTS,
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 1,
};

// ──────────────────────────────────────────────
// 技术博客创作
// ──────────────────────────────────────────────
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

const techBlogWriter: NewWorkflowTemplate = {
  slug: 'tech-blog-writer',
  name: '技术博客创作工作流',
  description:
    '从选题到成稿的内容流水线：选题 Agent 确定切入角度与大纲，研究 Agent 整理概念与代码示例，写作 Agent 生成初稿，审校 Agent 校对技术准确性并润色出终稿。',
  category: 'content',
  tags: ['内容创作', '博客写作', 'intermediate'],
  thumbnailUrl: '/covers/templates/tech-blog-writer.svg',
  definition: assembleDefinition(
    techBlogWriterInputSchema,
    [
      triggerAndInput(`const f = input['json-in'] || {};
const lines = ['博客主题：' + (f.topic || '未填写')];
lines.push('目标读者：' + (f.audience_level || '进阶'));
lines.push('目标字数：约 ' + (f.target_length || 1800) + ' 字');
const sections = Array.isArray(f.sections) ? f.sections : [];
if (sections.length) lines.push('需要包含的章节：' + sections.join('、'));
lines.join('\\n');`),
      promptedAgent({
        id: 'planner-agent',
        label: '选题 Agent',
        prompt:
          '你是技术内容策划。根据任务说明确定一个具体、有吸引力的切入角度，给出：最终标题、一句话核心观点、面向目标读者的文章大纲（含每节要点，覆盖用户要求的章节）。用 Markdown 输出。',
        column: 2,
        row: 0,
      }),
      promptedAgent({
        id: 'research-agent',
        label: '研究 Agent',
        prompt:
          '你是技术研究员。基于上游给出的标题与大纲，为每一节整理写作素材：准确的概念解释、关键原理、可运行的最小代码示例（标明语言）、常见坑与出处线索。先完整复述上游的标题与大纲，再按节列出素材。用 Markdown 输出。',
        column: 3,
        row: 0,
      }),
      promptedAgent({
        id: 'writer-agent',
        label: '写作 Agent',
        prompt:
          '你是技术写作者。根据上游的大纲与素材写出完整博客初稿：开头用一个具体场景引出问题，正文按大纲展开，代码示例放在对应小节，结尾给出总结与延伸阅读方向。篇幅与读者层级遵循附带表单 JSON 中的要求。直接输出 Markdown 正文。',
        column: 4,
        row: 0,
      }),
      promptedAgent({
        id: 'editor-agent',
        label: '审校 Agent',
        prompt:
          '你是资深技术编辑。逐段检查上游初稿的技术准确性、代码正确性、逻辑与可读性，直接修正问题，输出可发布的终稿 Markdown。不要附加修改说明。',
        column: 5,
        row: 0,
      }),
      {
        nodes: [templateNode('article', 'text-output', 6, 0, '博客终稿')],
        edges: [],
      },
    ],
    [
      templateEdge(INPUT_ID, 'text-out', 'planner-agent', 'text-in'),
      templateEdge('planner-agent', 'agent-out', 'research-agent', 'text-in'),
      templateEdge('research-agent', 'agent-out', 'writer-agent', 'text-in'),
      templateEdge(TRIGGER_ID, 'payload-out', 'writer-agent', 'context-in'),
      templateEdge('writer-agent', 'agent-out', 'editor-agent', 'text-in'),
      templateEdge('editor-agent', 'agent-out', 'article', 'content-in'),
    ],
  ),
  metadata: {
    author: TEMPLATE_AUTHOR,
    version: '2.0.0',
    estimated_runtime_seconds: 240,
    complexity: 'intermediate',
    node_count: 11,
    required_capabilities: TEMPLATE_REQUIREMENTS,
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 2,
};

// ──────────────────────────────────────────────
// 代码审查助手
// ──────────────────────────────────────────────
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
      label: '问题输出阈值（1 最轻，5 最严重）',
      required: false,
      validation: { min: 1, max: 5 },
      default: 2,
    },
  ],
};

const REVIEWERS = [
  {
    id: 'security-agent',
    label: '安全审查 Agent',
    prompt:
      '你是应用安全专家。只关注安全问题：注入、越权、敏感信息泄露、不安全的反序列化与依赖、输入校验缺失等。每个问题给出：严重度（1-5）、所在代码位置、问题说明、修复建议（含代码）。没有发现问题时明确写「未发现安全问题」。用 Markdown 列表输出。',
  },
  {
    id: 'performance-agent',
    label: '性能审查 Agent',
    prompt:
      '你是性能优化专家。只关注性能与资源问题：算法复杂度、重复计算、不必要的内存分配与拷贝、阻塞调用、N+1 查询、资源泄漏等。每个问题给出：严重度（1-5）、所在代码位置、问题说明、修复建议（含代码）。没有发现问题时明确写「未发现性能问题」。用 Markdown 列表输出。',
  },
  {
    id: 'quality-agent',
    label: '可维护性审查 Agent',
    prompt:
      '你是代码质量专家。只关注可维护性：命名、函数职责与长度、重复代码、错误处理、类型安全、可测试性与语言惯用法。每个问题给出：严重度（1-5）、所在代码位置、问题说明、修复建议（含代码）。没有发现问题时明确写「未发现可维护性问题」。用 Markdown 列表输出。',
  },
] as const;

const codeReviewAssistant: NewWorkflowTemplate = {
  slug: 'code-review-assistant',
  name: '代码审查助手',
  description:
    '三个审查 Agent 并行检查同一段代码的安全、性能与可维护性，合并结果后由汇总 Agent 去重、按严重度排序，给出带修复代码的综合审查报告。',
  category: 'development',
  tags: ['代码审查', '质量保证', 'advanced'],
  thumbnailUrl: '/covers/templates/code-review-assistant.svg',
  definition: assembleDefinition(
    codeReviewAssistantInputSchema,
    [
      triggerAndInput(`const f = input['json-in'] || {};
const lines = ['编程语言：' + (f.language || '未指定')];
const focus = Array.isArray(f.review_focus) ? f.review_focus : [];
if (focus.length) lines.push('用户关注的审查重点：' + focus.join('、'));
lines.push('待审查代码：');
lines.push('\`\`\`' + String(f.language || '').toLowerCase());
lines.push(f.code_snippet || '');
lines.push('\`\`\`');
lines.join('\\n');`),
      ...REVIEWERS.map((reviewer, index) =>
        promptedAgent({ ...reviewer, column: 2, row: index * 1.6 }),
      ),
      {
        nodes: [
          templateNode(
            'collect-reviews',
            'merge',
            3,
            1.6,
            '合并审查结果',
            { mode: 'append', inputCount: REVIEWERS.length },
            {
              inputCount: REVIEWERS.length,
              inputPorts: [
                {
                  id: 'exec-in',
                  label: '',
                  direction: 'input',
                  dataType: 'exec',
                },
                ...REVIEWERS.map((reviewer, index) => ({
                  id: `input-${index}`,
                  label: reviewer.label.replace(' Agent', ''),
                  direction: 'input',
                  dataType: 'json',
                })),
              ],
            },
          ),
          templateNode(
            'label-reviews',
            'input-preprocessor',
            4,
            1.6,
            '整理审查意见',
            {
              transformType: 'script',
              expression: `const results = Array.isArray(input['json-in']) ? input['json-in'] : [];
const titles = ${JSON.stringify(REVIEWERS.map((reviewer) => reviewer.label))};
titles.map(function (title, index) { return '## ' + title + '\\n\\n' + (results[index] || '（该审查没有返回结果）'); }).join('\\n\\n');`,
            },
          ),
        ],
        edges: [],
      },
      promptedAgent({
        id: 'summary-agent',
        label: '汇总 Agent',
        prompt:
          '你是代码审查负责人。合并上游三份审查意见：去掉重复与误报，按严重度从高到低排序，只保留严重度不低于附带表单 JSON 中 severity_threshold 的问题。输出 Markdown 报告：总体评价（1-2 句）与评分（0-100）、问题清单表格（严重度/类别/位置/说明）、逐条修复建议与示例代码、值得肯定的地方。',
        column: 5,
        row: 1.6,
      }),
      {
        nodes: [templateNode('report', 'text-output', 6, 1.6, '审查报告')],
        edges: [],
      },
    ],
    [
      ...REVIEWERS.flatMap((reviewer, index) => [
        templateEdge(INPUT_ID, 'text-out', reviewer.id, 'text-in'),
        templateEdge(
          reviewer.id,
          'agent-out',
          'collect-reviews',
          `input-${index}`,
        ),
      ]),
      templateEdge('collect-reviews', 'merged-out', 'label-reviews', 'json-in'),
      templateEdge('label-reviews', 'text-out', 'summary-agent', 'text-in'),
      templateEdge(TRIGGER_ID, 'payload-out', 'summary-agent', 'context-in'),
      templateEdge('summary-agent', 'agent-out', 'report', 'content-in'),
    ],
  ),
  metadata: {
    author: TEMPLATE_AUTHOR,
    version: '2.0.0',
    estimated_runtime_seconds: 120,
    complexity: 'advanced',
    node_count: 14,
    required_capabilities: TEMPLATE_REQUIREMENTS,
  } satisfies TemplateMetadata,
  isPublished: true,
  displayOrder: 3,
};

// ──────────────────────────────────────────────
// 数据报表自动生成
// ──────────────────────────────────────────────
const autoDataReportInputSchema: WorkflowInputSchema = {
  version: 1,
  collectionMode: 'form',
  fields: [
    {
      id: 'data',
      type: 'text',
      label: '数据（粘贴 CSV 或表格文本）',
      required: true,
      description: '第一行是表头，例如：日期,营收,活跃用户',
      validation: { minLength: 10, maxLength: 8000 },
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
      required: false,
      options: ['营收', '活跃用户', '转化率', '留存率', '异常波动'],
    },
    {
      id: 'chart_count',
      type: 'number',
      label: '图表建议数量上限',
      required: false,
      validation: { min: 1, max: 8 },
      default: 3,
    },
  ],
};

const autoDataReport: NewWorkflowTemplate = {
  slug: 'auto-data-report',
  name: '数据报表自动生成',
  description:
    '粘贴一份 CSV 或表格数据，数据整理 Agent 校验并计算关键指标，分析 Agent 找出趋势与异常，报告 Agent 写成带指标表格和图表建议的 Markdown 周期报表。',
  category: 'reporting',
  tags: ['数据分析', '报表生成', 'intermediate'],
  thumbnailUrl: '/covers/templates/auto-data-report.svg',
  definition: assembleDefinition(
    autoDataReportInputSchema,
    [
      triggerAndInput(`const f = input['json-in'] || {};
const lines = ['报表周期：' + (f.report_period || '周报')];
const metrics = Array.isArray(f.metrics) ? f.metrics : [];
if (metrics.length) lines.push('重点指标：' + metrics.join('、'));
lines.push('原始数据：');
lines.push(f.data || '');
lines.join('\\n');`),
      promptedAgent({
        id: 'data-agent',
        label: '数据整理 Agent',
        prompt:
          '你是数据工程师。解析任务说明中的原始数据：识别字段含义与单位，指出缺失值、异常值或格式问题，然后计算各重点指标的汇总值、环比/首尾变化率等基础统计。输出 Markdown：数据概况、数据质量问题、指标计算结果表格（给出计算口径）。不要编造数据中没有的数字。',
        column: 2,
        row: 0,
      }),
      promptedAgent({
        id: 'analysis-agent',
        label: '分析 Agent',
        prompt:
          '你是业务数据分析师。基于上游的指标计算结果，找出主要趋势、显著变化与异常点，并给出可能原因的假设（明确标注为假设）与需要进一步验证的问题。先完整保留上游的指标表格，再给出分析。用 Markdown 输出。',
        column: 3,
        row: 0,
      }),
      promptedAgent({
        id: 'report-agent',
        label: '报告 Agent',
        prompt:
          '你是报表撰写人。基于上游的指标与分析，按附带表单 JSON 中的报表周期写一份管理层可读的 Markdown 报表：核心结论（3 条以内）、关键指标表格、趋势与异常解读、下周期行动建议，以及不超过 chart_count 个图表建议（每个写明图表类型、横纵轴字段与想说明的问题）。',
        column: 4,
        row: 0,
      }),
      {
        nodes: [templateNode('report', 'text-output', 5, 0, '数据报表')],
        edges: [],
      },
    ],
    [
      templateEdge(INPUT_ID, 'text-out', 'data-agent', 'text-in'),
      templateEdge('data-agent', 'agent-out', 'analysis-agent', 'text-in'),
      templateEdge('analysis-agent', 'agent-out', 'report-agent', 'text-in'),
      templateEdge(TRIGGER_ID, 'payload-out', 'report-agent', 'context-in'),
      templateEdge('report-agent', 'agent-out', 'report', 'content-in'),
    ],
  ),
  metadata: {
    author: TEMPLATE_AUTHOR,
    version: '2.0.0',
    estimated_runtime_seconds: 150,
    complexity: 'intermediate',
    node_count: 9,
    required_capabilities: TEMPLATE_REQUIREMENTS,
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
          thumbnailUrl: sql`excluded.thumbnail_url`,
          definition: sql`excluded.definition`,
          metadata: sql`excluded.metadata`,
          isPublished: sql`excluded.is_published`,
          displayOrder: sql`excluded.display_order`,
          updatedAt: sql`now()`,
        },
      });
  }
}
