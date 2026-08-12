import { defineConfig } from 'vitepress';

/* ─── 中文侧边栏 ─── */
const zhSidebar = {
  '/zh/getting-started/': [
    {
      text: '快速上手',
      items: [
        { text: '什么是 AgentLoom', link: '/zh/getting-started/' },
        { text: '快速开始', link: '/zh/getting-started/quickstart' },
        { text: '核心概念', link: '/zh/getting-started/core-concepts' },
        { text: '界面导览', link: '/zh/getting-started/interface-overview' },
      ],
    },
  ],
  '/zh/workflows/': [
    {
      text: '工作流',
      items: [
        { text: '工作流概述', link: '/zh/workflows/' },
        { text: '创建工作流', link: '/zh/workflows/creating' },
        { text: '运行与监控', link: '/zh/workflows/running' },
        { text: '输入参数', link: '/zh/workflows/input-parameters' },
        { text: '调试工作流', link: '/zh/workflows/debugging' },
        { text: '版本管理', link: '/zh/workflows/versions' },
        { text: '分享与导出', link: '/zh/workflows/sharing' },
        { text: '使用模板', link: '/zh/workflows/templates' },
      ],
    },
  ],
  '/zh/agents/': [
    {
      text: 'Agent 智能体',
      items: [
        { text: 'Agent 概述', link: '/zh/agents/' },
        { text: '创建 Agent', link: '/zh/agents/creating' },
        { text: '与 Agent 对话', link: '/zh/agents/conversations' },
        { text: 'Agent 记忆', link: '/zh/agents/memory' },
        { text: '在工作流中使用 Agent', link: '/zh/agents/in-workflows' },
      ],
    },
  ],
  '/zh/nodes/': [
    {
      text: '节点参考',
      items: [
        { text: '节点概述', link: '/zh/nodes/' },
      ],
    },
    {
      text: 'AI 与推理',
      items: [
        { text: 'Agent 节点', link: '/zh/nodes/agent' },
        { text: '智能路由', link: '/zh/nodes/smart-routing' },
      ],
    },
    {
      text: '输入与输出',
      items: [
        { text: '文本输入', link: '/zh/nodes/text-input' },
        { text: '文本输出', link: '/zh/nodes/text-output' },
        { text: 'JSON 输出', link: '/zh/nodes/json-output' },
      ],
    },
    {
      text: '逻辑与控制',
      items: [
        { text: '条件分支', link: '/zh/nodes/condition' },
        { text: '触发器', link: '/zh/nodes/trigger' },
        { text: '可复用块', link: '/zh/nodes/reusable-block' },
      ],
    },
    {
      text: '工具与集成',
      items: [
        { text: 'HTTP 请求', link: '/zh/nodes/http-tool' },
        { text: 'MCP 工具', link: '/zh/nodes/mcp-tool' },
        { text: '代码沙箱', link: '/zh/nodes/sandbox' },
      ],
    },
    {
      text: '知识与技能',
      items: [
        { text: '知识库节点', link: '/zh/nodes/knowledge' },
        { text: '技能节点', link: '/zh/nodes/skill' },
      ],
    },
  ],
  '/zh/knowledge-base/': [
    {
      text: '知识库',
      items: [
        { text: '知识库概述', link: '/zh/knowledge-base/' },
        { text: '创建知识库', link: '/zh/knowledge-base/creating' },
        { text: '检索配置', link: '/zh/knowledge-base/retrieval' },
        { text: '在工作流中使用', link: '/zh/knowledge-base/in-workflows' },
      ],
    },
  ],
  '/zh/skills/': [
    {
      text: '技能系统',
      items: [
        { text: '技能概述', link: '/zh/skills/' },
        { text: '内置技能', link: '/zh/skills/built-in' },
        { text: '管理技能', link: '/zh/skills/managing' },
      ],
    },
  ],
  '/zh/triggers/': [
    {
      text: '触发器与自动化',
      items: [
        { text: '自动化概述', link: '/zh/triggers/' },
        { text: '定时触发', link: '/zh/triggers/cron' },
        { text: 'Webhook 触发', link: '/zh/triggers/webhook' },
        { text: 'API 事件触发', link: '/zh/triggers/api-event' },
      ],
    },
  ],
  '/zh/collaboration/': [
    {
      text: '团队协作',
      items: [
        { text: '协作概述', link: '/zh/collaboration/' },
        { text: '组织与工作区', link: '/zh/collaboration/workspace' },
        { text: '角色与权限', link: '/zh/collaboration/roles' },
        { text: '市场', link: '/zh/collaboration/marketplace' },
      ],
    },
  ],
  '/zh/integrations/': [
    {
      text: '集成',
      items: [
        { text: '集成概述', link: '/zh/integrations/' },
        { text: 'API 密钥管理', link: '/zh/integrations/api-keys' },
        { text: 'MCP 工具', link: '/zh/integrations/mcp-tools' },
        { text: '使用插件', link: '/zh/integrations/plugins' },
      ],
    },
  ],
  '/zh/account/': [
    {
      text: '账户设置',
      items: [
        { text: '账户概述', link: '/zh/account/' },
        { text: '安全设置', link: '/zh/account/security' },
        { text: '通知偏好', link: '/zh/account/notifications' },
      ],
    },
  ],
  '/zh/use-cases/': [
    {
      text: '用例教程',
      items: [
        { text: '用例总览', link: '/zh/use-cases/' },
        { text: '智能客服机器人', link: '/zh/use-cases/customer-support' },
        { text: 'RAG 文档分析', link: '/zh/use-cases/document-analysis' },
        { text: '自动化代码审查', link: '/zh/use-cases/code-review' },
        { text: '多 Agent 协作', link: '/zh/use-cases/multi-agent' },
      ],
    },
  ],
  '/zh/troubleshooting/': [
    {
      text: '故障排查',
      items: [
        { text: '常见问题', link: '/zh/troubleshooting/' },
        { text: 'FAQ', link: '/zh/troubleshooting/faq' },
        { text: '错误参考', link: '/zh/troubleshooting/errors' },
      ],
    },
  ],
  '/zh/whats-new/': [
    {
      text: '更新日志',
      items: [
        { text: '最新动态', link: '/zh/whats-new/' },
      ],
    },
  ],
  '/zh/api/': [
    {
      text: 'API 参考',
      items: [
        { text: 'API 概览', link: '/zh/api/' },
      ],
    },
  ],
  '/zh/mobile/': [
    {
      text: '移动端',
      items: [
        { text: '移动端入门', link: '/zh/mobile/' },
        { text: '功能指南', link: '/zh/mobile/features' },
      ],
    },
  ],
};

/* ─── 中文导航栏 ─── */
const zhNav = [
  { text: '快速上手', link: '/zh/getting-started/' },
  {
    text: '产品功能',
    items: [
      { text: '工作流', link: '/zh/workflows/' },
      { text: 'Agent 智能体', link: '/zh/agents/' },
      { text: '知识库', link: '/zh/knowledge-base/' },
      { text: '技能系统', link: '/zh/skills/' },
      { text: '触发器', link: '/zh/triggers/' },
    ],
  },
  { text: '节点参考', link: '/zh/nodes/' },
  {
    text: '团队与集成',
    items: [
      { text: '团队协作', link: '/zh/collaboration/' },
      { text: '集成连接', link: '/zh/integrations/' },
      { text: '账户设置', link: '/zh/account/' },
    ],
  },
  { text: '用例教程', link: '/zh/use-cases/' },
  {
    text: '更多',
    items: [
      { text: 'API 参考', link: '/zh/api/' },
      { text: '移动端', link: '/zh/mobile/' },
      { text: '故障排查', link: '/zh/troubleshooting/' },
      { text: '更新日志', link: '/zh/whats-new/' },
    ],
  },
];

/* ─── 英文导航栏 ─── */
const enNav = [
  { text: 'Getting Started', link: '/en/getting-started/' },
  {
    text: 'Features',
    items: [
      { text: 'Workflows', link: '/en/workflows/' },
      { text: 'Agents', link: '/en/agents/' },
      { text: 'Knowledge Base', link: '/en/knowledge-base/' },
      { text: 'Skills', link: '/en/skills/' },
      { text: 'Triggers', link: '/en/triggers/' },
    ],
  },
  { text: 'Node Reference', link: '/en/nodes/' },
  {
    text: 'Team & Integration',
    items: [
      { text: 'Collaboration', link: '/en/collaboration/' },
      { text: 'Integrations', link: '/en/integrations/' },
      { text: 'Account Settings', link: '/en/account/' },
    ],
  },
  { text: 'Use Cases', link: '/en/use-cases/' },
  {
    text: 'More',
    items: [
      { text: 'API Reference', link: '/en/api/' },
      { text: 'Mobile App', link: '/en/mobile/' },
      { text: 'Troubleshooting', link: '/en/troubleshooting/' },
      { text: "What's New", link: '/en/whats-new/' },
    ],
  },
];

/* ─── 英文侧边栏 (stub) ─── */
const enSidebar = {
  '/en/getting-started/': [
    {
      text: 'Getting Started',
      items: [
        { text: 'What is AgentLoom', link: '/en/getting-started/' },
        { text: 'Quick Start', link: '/en/getting-started/quickstart' },
        { text: 'Core Concepts', link: '/en/getting-started/core-concepts' },
        { text: 'Interface Overview', link: '/en/getting-started/interface-overview' },
      ],
    },
  ],
  '/en/workflows/': [
    {
      text: 'Workflows',
      items: [
        { text: 'Workflows', link: '/en/workflows/' },
        { text: 'Creating Workflows', link: '/en/workflows/creating' },
        { text: 'Running and Monitoring', link: '/en/workflows/running' },
        { text: 'Input Parameters', link: '/en/workflows/input-parameters' },
        { text: 'Debugging Workflows', link: '/en/workflows/debugging' },
        { text: 'Version Management', link: '/en/workflows/versions' },
        { text: 'Sharing and Export', link: '/en/workflows/sharing' },
        { text: 'Using Templates', link: '/en/workflows/templates' },
      ],
    },
  ],
  '/en/agents/': [
    {
      text: 'Agents',
      items: [
        { text: 'Agents', link: '/en/agents/' },
        { text: 'Creating Agents', link: '/en/agents/creating' },
        { text: 'Agent Conversations', link: '/en/agents/conversations' },
        { text: 'Agent Memory', link: '/en/agents/memory' },
        { text: 'Agents in Workflows', link: '/en/agents/in-workflows' },
      ],
    },
  ],
  '/en/nodes/': [
    {
      text: 'Node Reference',
      items: [
        { text: 'Node Reference', link: '/en/nodes/' },
      ],
    },
    {
      text: 'AI & Reasoning',
      items: [
        { text: 'Agent Node', link: '/en/nodes/agent' },
        { text: 'Smart Routing', link: '/en/nodes/smart-routing' },
      ],
    },
    {
      text: 'Input & Output',
      items: [
        { text: 'Text Input', link: '/en/nodes/text-input' },
        { text: 'Text Output', link: '/en/nodes/text-output' },
        { text: 'JSON Output', link: '/en/nodes/json-output' },
      ],
    },
    {
      text: 'Logic & Control',
      items: [
        { text: 'Condition', link: '/en/nodes/condition' },
        { text: 'Trigger', link: '/en/nodes/trigger' },
        { text: 'Reusable Block', link: '/en/nodes/reusable-block' },
      ],
    },
    {
      text: 'Tools & Integration',
      items: [
        { text: 'HTTP Request', link: '/en/nodes/http-tool' },
        { text: 'MCP Tool', link: '/en/nodes/mcp-tool' },
        { text: 'Code Sandbox', link: '/en/nodes/sandbox' },
      ],
    },
    {
      text: 'Knowledge & Skills',
      items: [
        { text: 'Knowledge Base Node', link: '/en/nodes/knowledge' },
        { text: 'Skill Node', link: '/en/nodes/skill' },
      ],
    },
  ],
  '/en/knowledge-base/': [
    {
      text: 'Knowledge Base',
      items: [
        { text: 'Knowledge Base', link: '/en/knowledge-base/' },
        { text: 'Creating Knowledge Base', link: '/en/knowledge-base/creating' },
        { text: 'Retrieval Settings', link: '/en/knowledge-base/retrieval' },
        { text: 'Using in Workflows', link: '/en/knowledge-base/in-workflows' },
      ],
    },
  ],
  '/en/skills/': [
    {
      text: 'Skills',
      items: [
        { text: 'Skills', link: '/en/skills/' },
        { text: 'Built-in Skills', link: '/en/skills/built-in' },
        { text: 'Managing Skills', link: '/en/skills/managing' },
      ],
    },
  ],
  '/en/triggers/': [
    {
      text: 'Triggers',
      items: [
        { text: 'Triggers', link: '/en/triggers/' },
        { text: 'Scheduled Triggers', link: '/en/triggers/cron' },
        { text: 'Webhook Triggers', link: '/en/triggers/webhook' },
        { text: 'API Event Triggers', link: '/en/triggers/api-event' },
      ],
    },
  ],
  '/en/collaboration/': [
    {
      text: 'Collaboration',
      items: [
        { text: 'Collaboration', link: '/en/collaboration/' },
        { text: 'Workspace', link: '/en/collaboration/workspace' },
        { text: 'Roles and Permissions', link: '/en/collaboration/roles' },
        { text: 'Marketplace', link: '/en/collaboration/marketplace' },
      ],
    },
  ],
  '/en/integrations/': [
    {
      text: 'Integrations',
      items: [
        { text: 'Integrations', link: '/en/integrations/' },
        { text: 'API Keys', link: '/en/integrations/api-keys' },
        { text: 'MCP Tools', link: '/en/integrations/mcp-tools' },
        { text: 'Plugins', link: '/en/integrations/plugins' },
      ],
    },
  ],
  '/en/account/': [
    {
      text: 'Account Settings',
      items: [
        { text: 'Account Settings', link: '/en/account/' },
        { text: 'Security', link: '/en/account/security' },
        { text: 'Notifications', link: '/en/account/notifications' },
      ],
    },
  ],
  '/en/use-cases/': [
    {
      text: 'Use Cases',
      items: [
        { text: 'Use Cases', link: '/en/use-cases/' },
        { text: 'Customer Support Bot', link: '/en/use-cases/customer-support' },
        { text: 'Document Analysis', link: '/en/use-cases/document-analysis' },
        { text: 'Code Review', link: '/en/use-cases/code-review' },
        { text: 'Multi-Agent Pipeline', link: '/en/use-cases/multi-agent' },
      ],
    },
  ],
  '/en/troubleshooting/': [
    {
      text: 'Troubleshooting',
      items: [
        { text: 'Troubleshooting', link: '/en/troubleshooting/' },
        { text: 'FAQ', link: '/en/troubleshooting/faq' },
        { text: 'Error Reference', link: '/en/troubleshooting/errors' },
      ],
    },
  ],
  '/en/whats-new/': [
    {
      text: "What's New",
      items: [
        { text: "What's New", link: '/en/whats-new/' },
      ],
    },
  ],
  '/en/api/': [
    {
      text: 'API Reference',
      items: [
        { text: 'API Reference', link: '/en/api/' },
      ],
    },
  ],
  '/en/mobile/': [
    {
      text: 'Mobile App',
      items: [
        { text: 'Mobile App', link: '/en/mobile/' },
        { text: 'Mobile Features', link: '/en/mobile/features' },
      ],
    },
  ],
};

/* ─── 主配置 ─── */
export default defineConfig({
  title: 'AgentLoom',
  description: 'AgentLoom 用户文档 — 多智能体工作流编排平台',

  base: '/documentation/',
  srcDir: '.',
  cleanUrls: true,
  lastUpdated: true,

  srcExclude: ['**/AGENTS.md', '**/_bmad/**', '**/node_modules/**'],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/documentation/logo.svg' }],
    ['meta', { name: 'theme-color', content: '#a855f7' }],
  ],

  locales: {
    zh: {
      label: '中文',
      lang: 'zh-CN',
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',

    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                displayDetails: '显示详细列表',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
        miniSearch: {
          options: {
            /* CJK 分词 */
            tokenize: (text: string) =>
              text.split(/[\s\-，。！？、；：""''（）【】\u200b]+/g).filter(Boolean),
          },
        },
      },
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/AgentLoom/agentloom' },
    ],

    footer: {
      message: 'AgentLoom — 让 AI Agent 协作更简单',
      copyright: `Copyright © ${new Date().getFullYear()} AgentLoom Team`,
    },

    editLink: undefined,
  },
});
