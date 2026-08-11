import { ChevronRight, Folder, FileText, AlertTriangle, Link2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { PriorityBadge } from './PriorityBadge'
import type { MemoryNode } from '../../types'

interface NodeGridCardProps {
  node: MemoryNode
  currentDomain: string
  onClick: () => void
}

const CROSS_DOMAIN_TONE = 'var(--color-node-agent)'

export function NodeGridCard({ node, currentDomain, onClick }: NodeGridCardProps) {
  const isCrossDomain = Boolean(node.domain) && node.domain !== currentDomain

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex h-full w-full flex-col items-start overflow-hidden rounded-card border bg-surface p-5 text-left shadow-node transition-all duration-150 hover:-translate-y-0.5 hover:shadow-node-selected',
        isCrossDomain ? 'border-transparent' : 'border-border hover:border-border-hover',
      )}
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
          className="flex shrink-0 items-center justify-center rounded-card bg-surface-elevated p-2 text-muted transition-colors group-hover:bg-primary/10 group-hover:text-primary"
        >
          {node.approxChildrenCount > 0 ? <Folder size={18} /> : <FileText size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {node.name || node.path.split('/').pop()}
          </h3>
          {isCrossDomain && (
            <span
              className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
              style={{
                border: `1px solid color-mix(in srgb, ${CROSS_DOMAIN_TONE} 30%, transparent)`,
                backgroundColor: `color-mix(in srgb, ${CROSS_DOMAIN_TONE} 12%, transparent)`,
                color: CROSS_DOMAIN_TONE,
              }}
            >
              <Link2 size={9} />
              {node.domain}://
            </span>
          )}
        </div>
        <PriorityBadge priority={node.priority} />
      </div>

      {node.disclosure && (
        <p
          className="mb-2 flex w-full items-start gap-1 text-[11px] leading-snug line-clamp-2"
          style={{ color: 'var(--color-warning)' }}
        >
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span className="italic">{node.disclosure}</span>
        </p>
      )}

      <div className="w-full flex-1">
        {node.contentSnippet ? (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted">
            {node.contentSnippet}
          </p>
        ) : (
          <p className="text-xs italic text-muted opacity-60">暂无预览</p>
        )}
      </div>

      <ChevronRight
        size={14}
        className="absolute bottom-4 right-4 text-primary opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
