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
import type { MemoryGraphFlowNode, MemoryNodeType } from './types'

/** 节点类型图标映射 */
const NODE_TYPE_ICONS: Record<MemoryNodeType, React.ElementType> = {
  root: Network,
  document: FileText,
  section: FolderTree,
  concept: Lightbulb,
  index: ListTree,
}

/** 节点类型背景色映射 */
const NODE_TYPE_COLORS: Record<MemoryNodeType, string> = {
  root: 'bg-violet-500/15',
  document: 'bg-sky-500/15',
  section: 'bg-emerald-500/15',
  concept: 'bg-amber-500/15',
  index: 'bg-rose-500/15',
}

/** 披露等级配色 */
const DISCLOSURE_COLORS: Record<string, string> = {
  public: 'bg-emerald-500/20 text-emerald-300',
  internal: 'bg-amber-500/20 text-amber-300',
  confidential: 'bg-rose-500/20 text-rose-300',
  restricted: 'bg-red-500/20 text-red-300',
}

const DEFAULT_DISCLOSURE_COLOR = 'bg-zinc-500/20 text-zinc-300'

export const MemoryGraphNode = memo(function MemoryGraphNode({
  data,
  selected,
}: NodeProps<MemoryGraphFlowNode>) {
  const IconComponent = NODE_TYPE_ICONS[data.nodeType] ?? Brain
  const iconBg = NODE_TYPE_COLORS[data.nodeType] ?? 'bg-zinc-500/15'
  const disclosureColor =
    data.disclosureLevel
      ? DISCLOSURE_COLORS[data.disclosureLevel] ?? DEFAULT_DISCLOSURE_COLOR
      : null

  return (
    <div
      className={cn(
        'relative rounded-xl border px-4 py-3 shadow-md transition-all duration-200',
        'min-w-[180px] max-w-[240px]',
        'bg-card/90 backdrop-blur-sm',
        selected
          ? 'ring-2 ring-primary border-primary/60'
          : 'ring-1 ring-border/40 border-border/60',
        data.isHighlighted && 'ring-2 ring-yellow-400/80 border-yellow-400/60',
        data.isDimmed && 'opacity-30',
      )}
      data-testid={`memory-graph-node-${data.nodeId}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-border !bg-muted-foreground"
      />

      {/* 头部：图标 + 标题 + 域标签 */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            iconBg,
          )}
        >
          <IconComponent className="h-4 w-4 text-foreground/80" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {data.name}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {data.nodeType}
            {data.domain && ` · ${data.domain}`}
          </p>
        </div>
      </div>

      {/* 内容摘要 */}
      {data.contentSnippet && (
        <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
          {data.contentSnippet}
        </p>
      )}

      {/* 底部：披露等级徽章 */}
      {disclosureColor && (
        <div className="mt-2 flex items-center">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium',
              disclosureColor,
            )}
            data-testid="disclosure-badge"
          >
            {data.disclosureLevel}
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-border !bg-muted-foreground"
      />
    </div>
  )
})
