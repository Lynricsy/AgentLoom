import type { NodeCategory, PaletteGroup, PaletteNodeItem } from '../types'
import { NODE_TYPE_REGISTRY, type NodeTypeConfig } from '../types/nodeTypeRegistry'

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  agent: { label: 'Agent', icon: 'Bot', color: 'var(--color-type-model)' },
  tool: { label: 'Tool', icon: 'Wrench', color: 'var(--color-type-tool)' },
  trigger: { label: 'Trigger', icon: 'Zap', color: 'var(--color-warning)' },
  knowledge: { label: 'Knowledge', icon: 'BookOpen', color: 'var(--color-type-knowledge)' },
  output: { label: 'Output', icon: 'ArrowRightFromLine', color: 'var(--color-type-text)' },
  control: { label: 'Control', icon: 'GitBranch', color: 'var(--color-muted)' },
}

const CATEGORY_ORDER: NodeCategory[] = ['agent', 'tool', 'trigger', 'knowledge', 'output', 'control']

export function buildPaletteGroups(
  registry: Record<string, NodeTypeConfig> = NODE_TYPE_REGISTRY,
): PaletteGroup[] {
  const grouped = new Map<NodeCategory, PaletteNodeItem[]>()

  for (const config of Object.values(registry)) {
    const items = grouped.get(config.category) ?? []
    items.push({
      type: config.type,
      label: config.label,
      category: config.category,
      icon: config.icon,
      description: config.description,
    })
    grouped.set(config.category, items)
  }

  return CATEGORY_ORDER
    .filter((category) => grouped.has(category))
    .map((category) => ({
      category,
      label: NODE_CATEGORIES[category].label,
      icon: NODE_CATEGORIES[category].icon,
      color: NODE_CATEGORIES[category].color,
      items: grouped.get(category) ?? [],
    }))
}

export const PALETTE_GROUPS = buildPaletteGroups()
