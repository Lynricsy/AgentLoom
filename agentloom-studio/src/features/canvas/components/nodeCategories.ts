import type { NodeCategory } from '../types'
import { buildPaletteGroups } from '../nodeTypeRegistry'

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  agent: { label: 'Agent', icon: 'Bot', color: 'var(--color-type-model)' },
  tool: { label: 'Tool', icon: 'Wrench', color: 'var(--color-type-tool)' },
  trigger: { label: 'Trigger', icon: 'Zap', color: 'var(--color-warning)' },
  knowledge: { label: 'Knowledge', icon: 'BookOpen', color: 'var(--color-type-knowledge)' },
  output: { label: 'Output', icon: 'ArrowRightFromLine', color: 'var(--color-type-text)' },
  control: { label: 'Control', icon: 'GitBranch', color: 'var(--color-muted)' },
}

export const PALETTE_GROUPS = buildPaletteGroups(NODE_CATEGORIES)
