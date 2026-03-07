import type { PaletteGroup, NodeCategory } from '../types'

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  agent: { label: 'Agent', icon: 'Bot', color: 'var(--color-type-model)' },
  tool: { label: 'Tool', icon: 'Wrench', color: 'var(--color-type-tool)' },
  trigger: { label: 'Trigger', icon: 'Zap', color: 'var(--color-warning)' },
  knowledge: { label: 'Knowledge', icon: 'BookOpen', color: 'var(--color-type-knowledge)' },
  output: { label: 'Output', icon: 'ArrowRightFromLine', color: 'var(--color-type-text)' },
  control: { label: 'Control', icon: 'GitBranch', color: 'var(--color-muted)' },
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    category: 'agent',
    label: 'Agent',
    icon: 'Bot',
    color: 'var(--color-type-model)',
    items: [
      { type: 'llm-agent', label: 'LLM Agent', category: 'agent', icon: 'Bot', description: '大语言模型 Agent 节点' },
      { type: 'chat-agent', label: 'Chat Agent', category: 'agent', icon: 'MessageSquare', description: '对话型 Agent 节点' },
    ],
  },
  {
    category: 'tool',
    label: 'Tool',
    icon: 'Wrench',
    color: 'var(--color-type-tool)',
    items: [
      { type: 'http-tool', label: 'HTTP Request', category: 'tool', icon: 'Globe', description: 'HTTP 请求工具' },
      { type: 'code-tool', label: 'Code Executor', category: 'tool', icon: 'Code', description: '代码执行工具' },
    ],
  },
  {
    category: 'trigger',
    label: 'Trigger',
    icon: 'Zap',
    color: 'var(--color-warning)',
    items: [
      { type: 'manual-trigger', label: 'Manual Trigger', category: 'trigger', icon: 'Play', description: '手动触发器' },
      { type: 'schedule-trigger', label: 'Schedule', category: 'trigger', icon: 'Clock', description: '定时触发器' },
    ],
  },
  {
    category: 'knowledge',
    label: 'Knowledge',
    icon: 'BookOpen',
    color: 'var(--color-type-knowledge)',
    items: [
      { type: 'knowledge-base', label: 'Knowledge Base', category: 'knowledge', icon: 'Database', description: '知识库检索节点' },
    ],
  },
  {
    category: 'output',
    label: 'Output',
    icon: 'ArrowRightFromLine',
    color: 'var(--color-type-text)',
    items: [
      { type: 'text-output', label: 'Text Output', category: 'output', icon: 'FileText', description: '文本输出节点' },
      { type: 'json-output', label: 'JSON Output', category: 'output', icon: 'Braces', description: 'JSON 输出节点' },
    ],
  },
  {
    category: 'control',
    label: 'Control',
    icon: 'GitBranch',
    color: 'var(--color-muted)',
    items: [
      { type: 'condition', label: 'Condition', category: 'control', icon: 'GitBranch', description: '条件分支节点' },
      { type: 'loop', label: 'Loop', category: 'control', icon: 'Repeat', description: '循环控制节点' },
    ],
  },
]
