import type { NodeCategory, PaletteGroup, PaletteNodeItem } from '../types'
import {
  DYNAMIC_ONLY_NODE_TYPES,
  NODE_TYPE_REGISTRY,
  type NodeType,
  type NodeTypeConfig,
} from '../types/nodeTypeRegistry'

export const NODE_CATEGORIES: Record<NodeCategory, { label: string; icon: string; color: string }> = {
  agent: { label: 'Agent', icon: 'Bot', color: 'var(--color-node-agent)' },
  tool: { label: 'Tool', icon: 'Wrench', color: 'var(--color-node-tool)' },
  trigger: { label: 'Trigger', icon: 'Zap', color: 'var(--color-node-trigger)' },
  knowledge: { label: 'Knowledge', icon: 'BookOpen', color: 'var(--color-node-knowledge)' },
  output: { label: 'Output', icon: 'ArrowRightFromLine', color: 'var(--color-node-output)' },
  control: { label: 'Control', icon: 'GitBranch', color: 'var(--color-node-control)' },
  plugin: { label: 'Plugin', icon: 'Puzzle', color: 'var(--color-node-plugin)' },
  memory: { label: 'Memory', icon: 'BrainCircuit', color: 'var(--color-node-memory)' },
}

const CATEGORY_ORDER: NodeCategory[] = ['agent', 'tool', 'trigger', 'knowledge', 'memory', 'output', 'control', 'plugin']
const PALETTE_VISIBLE_DYNAMIC_NODE_TYPES: ReadonlySet<NodeType> = new Set([
  'merge',
])

interface SearchablePaletteNodeLike {
  type: string
  label: string
  description: string
  category: NodeCategory
}

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collapseSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, '')
}

function buildSearchAliases(value: string | undefined): string[] {
  if (!value) {
    return []
  }

  const normalized = normalizeSearchValue(value)
  const collapsed = collapseSearchValue(value)
  return Array.from(new Set([value, normalized, collapsed].filter(Boolean)))
}

export function buildPaletteSearchText(
  item: SearchablePaletteNodeLike,
  extras: Array<string | undefined> = [],
): string {
  return [
    ...buildSearchAliases(item.type),
    item.label,
    item.description,
    NODE_CATEGORIES[item.category].label,
    ...extras.flatMap((value) => buildSearchAliases(value)),
  ]
    .filter(Boolean)
    .join(' ')
}

export function matchesPaletteSearch(
  item: Pick<PaletteNodeItem, 'label' | 'description' | 'searchText'>,
  query: string,
): boolean {
  const searchableText = [item.label, item.description, item.searchText]
    .filter(Boolean)
    .join(' ')

  const normalizedQuery = normalizeSearchValue(query)
  if (normalizedQuery.length === 0) {
    return true
  }

  const normalizedSearchableText = normalizeSearchValue(searchableText)
  if (normalizedSearchableText.includes(normalizedQuery)) {
    return true
  }

  return collapseSearchValue(searchableText).includes(collapseSearchValue(query))
}

export function buildPaletteGroups(
  registry: Record<string, NodeTypeConfig> = NODE_TYPE_REGISTRY,
): PaletteGroup[] {
  const grouped = new Map<NodeCategory, PaletteNodeItem[]>()

  for (const config of Object.values(registry)) {
    if (
      DYNAMIC_ONLY_NODE_TYPES.has(config.type) &&
      !PALETTE_VISIBLE_DYNAMIC_NODE_TYPES.has(config.type)
    ) {
      continue
    }
    const items = grouped.get(config.category) ?? []
    items.push({
      type: config.type,
      label: config.label,
      category: config.category,
      icon: config.icon,
      description: config.description,
      searchText: buildPaletteSearchText(config),
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
