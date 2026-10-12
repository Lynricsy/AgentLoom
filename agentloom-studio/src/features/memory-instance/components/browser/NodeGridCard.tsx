import { ChevronRight, Folder, FileText, AlertTriangle, Link2 } from 'lucide-react'
import { Card } from '@/shared/ui/card'
import { PriorityBadge } from './PriorityBadge'
import type { MemoryNode } from '../../types'

interface NodeGridCardProps {
  node: MemoryNode
  currentDomain: string
  onClick: () => void
}

const CROSS_DOMAIN_TONE = 'var(--color-node-agent)'

/** 节点卡片：可点击卡片统一走 <Card interactive>（hover 抬升由原语负责） */
export function NodeGridCard({ node, currentDomain, onClick }: NodeGridCardProps) {
  const isCrossDomain = Boolean(node.domain) && node.domain !== currentDomain
  const title = node.name || node.path.split('/').pop()

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      className="group flex h-full w-full flex-col p-5 text-left"
      style={
        isCrossDomain
          ? {
              borderColor: `color-mix(in srgb, ${CROSS_DOMAIN_TONE} 40%, var(--color-border))`,
            }
          : undefined
      }
    >
      <div className="mb-3 flex w-full items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors duration-150 group-hover:bg-primary/10 group-hover:text-primary"
        >
          {node.approxChildrenCount > 0 ? (
            <Folder className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-sm font-semibold text-foreground transition-colors duration-150 group-hover:text-primary">
            {title}
          </h3>
          {isCrossDomain && (
            <span
              className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-2xs"
              style={{
                border: `1px solid color-mix(in srgb, ${CROSS_DOMAIN_TONE} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${CROSS_DOMAIN_TONE} 12%, transparent)`,
                color: CROSS_DOMAIN_TONE,
              }}
            >
              <Link2 className="size-2.5 shrink-0" />
              <span className="truncate">{node.domain}://</span>
            </span>
          )}
        </div>
        <PriorityBadge priority={node.priority} />
        {/* 进入提示放在标题行，不再绝对定位压住正文末行 */}
        <ChevronRight
          aria-hidden
          className="size-3.5 shrink-0 text-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </div>

      {node.disclosure && (
        // line-clamp 依赖 -webkit-box，容器不能再是 flex；图标作为行内元素随文字排版
        <p className="mb-2 line-clamp-2 break-words text-2xs leading-snug text-warning">
          <AlertTriangle className="mr-1 inline size-3 align-middle" />
          <span className="italic">{node.disclosure}</span>
        </p>
      )}

      <div className="w-full flex-1">
        {node.contentSnippet ? (
          <p className="line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
            {node.contentSnippet}
          </p>
        ) : (
          <p className="text-xs italic text-subtle-foreground">暂无预览</p>
        )}
      </div>
    </Card>
  )
}
