import { ChevronRight, Folder, FileText, AlertTriangle, Link2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { PriorityBadge } from './PriorityBadge'
import type { MemoryNode } from '../../types'

interface NodeGridCardProps {
  node: MemoryNode
  currentDomain: string
  onClick: () => void
}

export function NodeGridCard({ node, currentDomain, onClick }: NodeGridCardProps) {
  const isCrossDomain = Boolean(node.domain) && node.domain !== currentDomain

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex h-full w-full flex-col items-start overflow-hidden rounded-xl border bg-surface-elevated p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg',
        isCrossDomain
          ? 'border-violet-800/40 hover:border-violet-500/40'
          : 'border-border hover:border-primary/30',
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="mb-3 flex w-full items-center gap-3">
        <div className="flex shrink-0 items-center justify-center rounded-lg bg-muted p-2 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          {node.approxChildrenCount > 0 ? <Folder size={18} /> : <FileText size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            {node.name || node.path.split('/').pop()}
          </h3>
          {isCrossDomain && (
            <span className="mt-1 inline-flex items-center gap-1 rounded border border-violet-800/30 bg-violet-950/40 px-1.5 py-0.5 font-mono text-[10px] text-violet-400/80">
              <Link2 size={9} />
              {node.domain}://
            </span>
          )}
        </div>
        <PriorityBadge priority={node.priority} />
      </div>

      {node.disclosure && (
        <div className="mb-2 w-full">
          <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-500/70 line-clamp-2">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            <span className="italic">{node.disclosure}</span>
          </p>
        </div>
      )}

      <div className="w-full flex-1">
        {node.contentSnippet ? (
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
            {node.contentSnippet}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground/50">暂无预览</p>
        )}
      </div>

      <ChevronRight
        size={14}
        className="absolute bottom-4 right-4 text-primary/50 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
