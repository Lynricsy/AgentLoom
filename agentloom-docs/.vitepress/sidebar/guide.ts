import type { DefaultTheme } from 'vitepress'

// 用户指南侧边栏：新增/移动 guide/ 页面时同步本文件
const guide: DefaultTheme.SidebarItem[] = [
  { text: '用户指南', link: '/guide/' },
  {
    text: '快速上手',
    collapsed: false,
    items: [
      { text: '什么是 AgentLoom', link: '/guide/getting-started/' },
      { text: '快速开始', link: '/guide/getting-started/quickstart' },
      { text: '核心概念', link: '/guide/getting-started/core-concepts' },
      { text: '界面导览', link: '/guide/getting-started/interface-overview' },
    ],
  },
  {
    text: '工作流',
    collapsed: true,
    items: [
      { text: '工作流概述', link: '/guide/workflows/' },
      { text: '创建工作流', link: '/guide/workflows/creating' },
      { text: '运行与监控', link: '/guide/workflows/running' },
      { text: '输入参数', link: '/guide/workflows/input-parameters' },
      { text: '调试工作流', link: '/guide/workflows/debugging' },
      { text: '版本管理', link: '/guide/workflows/versions' },
      { text: '分享与导出', link: '/guide/workflows/sharing' },
      { text: '使用模板', link: '/guide/workflows/templates' },
    ],
  },
  {
    text: 'Agent',
    collapsed: true,
    items: [
      { text: 'Agent 概述', link: '/guide/agents/' },
      { text: '创建 Agent', link: '/guide/agents/creating' },
      { text: '与 Agent 对话', link: '/guide/agents/conversations' },
      { text: 'Agent 记忆', link: '/guide/agents/memory' },
      { text: '在工作流中使用 Agent', link: '/guide/agents/in-workflows' },
    ],
  },
  {
    text: '节点参考',
    collapsed: true,
    items: [
      { text: '节点概述', link: '/guide/nodes/' },
      { text: 'Agent 节点', link: '/guide/nodes/agent' },
      { text: '智能路由', link: '/guide/nodes/smart-routing' },
      { text: '文本输入', link: '/guide/nodes/text-input' },
      { text: '文本输出', link: '/guide/nodes/text-output' },
      { text: 'JSON 输出', link: '/guide/nodes/json-output' },
      { text: '条件分支', link: '/guide/nodes/condition' },
      { text: '触发器', link: '/guide/nodes/trigger' },
      { text: '可复用块', link: '/guide/nodes/reusable-block' },
      { text: 'HTTP 请求', link: '/guide/nodes/http-tool' },
      { text: 'MCP 工具', link: '/guide/nodes/mcp-tool' },
      { text: '代码沙箱', link: '/guide/nodes/sandbox' },
      { text: '知识库节点', link: '/guide/nodes/knowledge' },
      { text: '技能节点', link: '/guide/nodes/skill' },
    ],
  },
  {
    text: '知识库',
    collapsed: true,
    items: [
      { text: '知识库概述', link: '/guide/knowledge-base/' },
      { text: '创建知识库', link: '/guide/knowledge-base/creating' },
      { text: '检索配置', link: '/guide/knowledge-base/retrieval' },
      { text: '在工作流中使用', link: '/guide/knowledge-base/in-workflows' },
    ],
  },
  {
    text: '技能',
    collapsed: true,
    items: [
      { text: '技能概述', link: '/guide/skills/' },
      { text: '内置技能', link: '/guide/skills/built-in' },
      { text: '管理技能', link: '/guide/skills/managing' },
    ],
  },
  {
    text: '触发器与自动化',
    collapsed: true,
    items: [
      { text: '自动化概述', link: '/guide/triggers/' },
      { text: '定时触发', link: '/guide/triggers/cron' },
      { text: 'Webhook 触发', link: '/guide/triggers/webhook' },
      { text: 'API 事件触发', link: '/guide/triggers/api-event' },
    ],
  },
  {
    text: '团队协作',
    collapsed: true,
    items: [
      { text: '协作概述', link: '/guide/collaboration/' },
      { text: '组织与工作区', link: '/guide/collaboration/workspace' },
      { text: '角色与权限', link: '/guide/collaboration/roles' },
      { text: '市场', link: '/guide/collaboration/marketplace' },
    ],
  },
  {
    text: '集成',
    collapsed: true,
    items: [
      { text: '集成概述', link: '/guide/integrations/' },
      { text: 'API Token', link: '/guide/integrations/api-keys' },
      { text: 'MCP 工具', link: '/guide/integrations/mcp-tools' },
      { text: '使用插件', link: '/guide/integrations/plugins' },
    ],
  },
  {
    text: '账户设置',
    collapsed: true,
    items: [
      { text: '账户概述', link: '/guide/account/' },
      { text: '安全设置', link: '/guide/account/security' },
      { text: '通知', link: '/guide/account/notifications' },
    ],
  },
  {
    text: '移动端',
    collapsed: true,
    items: [
      { text: '移动端入门', link: '/guide/mobile/' },
      { text: '功能指南', link: '/guide/mobile/features' },
    ],
  },
  {
    text: '用例教程',
    collapsed: true,
    items: [
      { text: '用例总览', link: '/guide/use-cases/' },
      { text: '智能客服机器人', link: '/guide/use-cases/customer-support' },
      { text: 'RAG 文档分析', link: '/guide/use-cases/document-analysis' },
      { text: '自动化代码审查', link: '/guide/use-cases/code-review' },
      { text: '多 Agent 协作', link: '/guide/use-cases/multi-agent' },
    ],
  },
  {
    text: '故障排查',
    collapsed: true,
    items: [
      { text: '常见问题', link: '/guide/troubleshooting/' },
      { text: 'FAQ', link: '/guide/troubleshooting/faq' },
      { text: '错误参考', link: '/guide/troubleshooting/errors' },
    ],
  },
]

export default guide
