import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Brain,
  FileText,
  FolderTree,
  Lightbulb,
  ListTree,
  Network,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import type { MemoryGraphFlowNode, MemoryNodeType } from './types'

const NODE_TYPE_ICONS: Record<MemoryNodeType, React.ElementType> = {
  root: Network,
  document: FileText,
  section: FolderTree,
  concept: Lightbulb,
  index: ListTree,
}

/**
 * 节点类别色 — 接入全局类别色体系（`--color-node-*` / `--color-type-*`），
 * 浅/深两套主题各自在 index.css 中给出取值，此处只引用变量。
 */
export const NODE_TYPE_COLORS: Record<MemoryNodeType, string> = {
  root: 'var(--color-node-memory)',
  document: 'var(--color-type-text)',
  section: 'var(--color-type-json)',
  concept: 'var(--color-node-knowledge)',
  index: 'var(--color-node-routing)',
}

export const NODE_TYPE_LABELS: Record<MemoryNodeType, string> = {
  root: '根节点',
  document: '文档',
  section: '章节',
  concept: '概念',
  index: '索引',
}

const DEFAULT_NODE_COLOR = 'var(--color-muted)'

/** 披露等级 — 由低到高映射到状态色阶梯 */
const DISCLOSURE_COLORS: Record<string, string> = {
  public: 'var(--color-success)',
  internal: 'var(--color-info)',
  confidential: 'var(--color-warning)',
  restricted: 'var(--color-error)',
}

const DEFAULT_DISCLOSURE_COLOR = DEFAULT_NODE_COLOR

const HANDLE_CLASS =
  '!h-2 !w-2 !border !border-border !bg-surface-elevated'

export const MemoryGraphNode = memo(function MemoryGraphNode({
  data,
  selected,
}: NodeProps<MemoryGraphFlowNode>) {
  const IconComponent = NODE_TYPE_ICONS[data.nodeType] ?? Brain
  const accent = NODE_TYPE_COLORS[data.nodeType] ?? DEFAULT_NODE_COLOR
  const disclosureColor = data.disclosureLevel
    ? (DISCLOSURE_COLORS[data.disclosureLevel] ?? DEFAULT_DISCLOSURE_COLOR)
    : null

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[240px] rounded-card border bg-surface px-4 py-3',
        'shadow-node transition-all duration-150 hover:shadow-node-selected',
        selected && 'shadow-node-selected',
        data.isHighlighted && 'ring-2 ring-warning',
        data.isDimmed && 'opacity-30',
      )}
      style={{
        borderColor: selected
          ? accent
          : `color-mix(in srgb, ${accent} 35%, var(--color-border))`,
        outline: selected ? `2px solid ${accent}` : undefined,
        outlineOffset: selected ? '1px' : undefined,
      }}
      data-node-type={data.nodeType}
      data-highlighted={data.isHighlighted ? 'true' : undefined}
      data-dimmed={data.isDimmed ? 'true' : undefined}
      data-testid={`memory-graph-node-${data.nodeId}`}
    >
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />

      {/* 头部：类别色图标芯片 + 标题 + 类型/域 */}
      <div className="flex items-center gap-2.5">
        <div
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 16%, transparent)`,
            color: accent,
          }}
        >
          <IconComponent className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {data.name}
          </p>
          <p className="truncate text-[10px] text-muted">
            {data.nodeType}
            {data.domain && ` · ${data.domain}`}
          </p>
        </div>
      </div>

      {/* 内容摘要 */}
      {data.contentSnippet && (
        <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted">
          {data.contentSnippet}
        </p>
      )}

      {/* 底部：披露等级徽章 */}
      {disclosureColor && (
        <div className="mt-2 flex items-center">
          <Badge size="sm" tone={disclosureColor} data-testid="disclosure-badge">
            {data.disclosureLevel}
          </Badge>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className={HANDLE_CLASS}
      />
    </div>
  )
})
