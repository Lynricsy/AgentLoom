import {
  Activity,
  AppWindow,
  BookOpen,
  Bot,
  BrainCircuit,
  Code,
  Compass,
  Container,
  Cpu,
  FileText,
  FolderOpen,
  LayoutTemplate,
  Puzzle,
  Server,
  Sparkles,
  Store,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  /** 路径前缀匹配，决定 active 态 */
  matchPrefix: string
}

export interface NavGroup {
  /** 分组标识，同时作为折叠状态的持久化 key */
  id: string
  label: string
  items: NavItem[]
}

/**
 * 全局主导航模型 — AppSidebar、移动端导航 Sheet 与命令面板共用此唯一来源。
 * 新增页面时只需在此追加，三处入口自动同步。
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'build',
    label: '构建',
    items: [
      { label: '工作流', icon: Workflow, to: '/workflows', matchPrefix: '/workflows' },
      { label: 'Agent', icon: Bot, to: '/agents', matchPrefix: '/agents' },
      {
        label: '生成应用',
        icon: AppWindow,
        to: '/generated-apps',
        matchPrefix: '/generated-apps',
      },
    ],
  },
  {
    id: 'discover',
    label: '探索',
    items: [
      { label: '发现', icon: Compass, to: '/discover', matchPrefix: '/discover' },
      { label: '市场', icon: Store, to: '/marketplace', matchPrefix: '/marketplace' },
      {
        label: '模板',
        icon: LayoutTemplate,
        to: '/templates',
        matchPrefix: '/templates',
      },
      {
        label: '开发者',
        icon: Code,
        to: '/developer-console/earnings',
        matchPrefix: '/developer-console',
      },
    ],
  },
  {
    id: 'resources',
    label: '资源',
    items: [
      {
        label: 'MCP 服务',
        icon: Server,
        to: '/resources/mcp-servers',
        matchPrefix: '/resources/mcp-servers',
      },
      {
        label: 'LLM 模型',
        icon: Cpu,
        to: '/resources/llm-models',
        matchPrefix: '/resources/llm-models',
      },
      {
        label: '技能',
        icon: Sparkles,
        to: '/resources/skills',
        matchPrefix: '/resources/skills',
      },
      {
        label: '知识库',
        icon: BookOpen,
        to: '/resources/knowledge-bases',
        matchPrefix: '/resources/knowledge-bases',
      },
      {
        label: '记忆',
        icon: BrainCircuit,
        to: '/resources/memory-instances',
        matchPrefix: '/resources/memory-instances',
      },
      {
        label: '工作区',
        icon: FolderOpen,
        to: '/resources/workspaces',
        matchPrefix: '/resources/workspaces',
      },
      {
        label: '沙箱',
        icon: Container,
        to: '/resources/sandboxes',
        matchPrefix: '/resources/sandboxes',
      },
      {
        label: '插件',
        icon: Puzzle,
        to: '/resources/plugins',
        matchPrefix: '/resources/plugins',
      },
    ],
  },
  {
    id: 'operations',
    label: '运维',
    items: [
      {
        label: '监控',
        icon: Activity,
        to: '/settings/monitoring',
        matchPrefix: '/settings/monitoring',
      },
      {
        label: '审计日志',
        icon: FileText,
        to: '/settings/audit-logs',
        matchPrefix: '/settings/audit-logs',
      },
    ],
  },
]

/** 扁平化的全部导航项，供命令面板检索 */
export const NAV_ITEMS_FLAT: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)
