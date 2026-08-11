import { memo } from 'react'
import { motion } from 'motion/react'
import { X, Clock, FileText, Hash } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { panelSlideRight } from '@/shared/lib/motion'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { useMemoryNodeDetail, useMemoryNodeVersions } from './api'
import { NODE_TYPE_COLORS } from './MemoryGraphNode'
import type { MemoryNodeType } from './types'

interface NodeDetailPanelProps {
  instanceId: string
  nodeId: string
  onClose: () => void
}

/** 披露等级 → 状态色阶梯（与 MemoryGraphNode 保持一致） */
const DISCLOSURE_COLORS: Record<string, string> = {
  public: 'var(--color-success)',
  internal: 'var(--color-info)',
  confidential: 'var(--color-warning)',
  restricted: 'var(--color-error)',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
      {children}
    </p>
  )
}

export const NodeDetailPanel = memo(function NodeDetailPanel({
  instanceId,
  nodeId,
  onClose,
}: NodeDetailPanelProps) {
  const { data: node, isLoading: nodeLoading } = useMemoryNodeDetail(
    instanceId,
    nodeId,
  )
  const { data: versions, isLoading: versionsLoading } = useMemoryNodeVersions(
    instanceId,
    nodeId,
  )

  const accent = node
    ? (NODE_TYPE_COLORS[node.nodeType as MemoryNodeType] ??
      'var(--color-muted)')
    : 'var(--color-muted)'

  return (
    <motion.aside
      {...panelSlideRight}
      className={cn(
        'absolute right-0 top-0 z-20 flex h-full w-[360px] max-w-[85vw] flex-col',
        'border-l border-border bg-surface/95 shadow-panel backdrop-blur-md',
      )}
      data-testid="node-detail-panel"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">节点详情</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="h-7 w-7 text-muted hover:text-foreground"
          aria-label="关闭详情面板"
          data-testid="node-detail-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {nodeLoading ? (
          <div className="space-y-3" data-testid="node-detail-loading">
            <Skeleton className="h-4 w-2/3 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : node ? (
          <>
            {/* 节点基本信息 */}
            <div className="space-y-3">
              <div>
                <FieldLabel>名称</FieldLabel>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {node.name}
                </p>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <div>
                  <FieldLabel>类型</FieldLabel>
                  <div className="mt-1">
                    <Badge size="sm" tone={accent}>
                      {node.nodeType}
                    </Badge>
                  </div>
                </div>
                {node.domain && (
                  <div>
                    <FieldLabel>域</FieldLabel>
                    <div className="mt-1">
                      <Badge size="sm" variant="secondary">
                        {node.domain}
                      </Badge>
                    </div>
                  </div>
                )}
                {node.disclosureLevel && (
                  <div>
                    <FieldLabel>披露等级</FieldLabel>
                    <div className="mt-1">
                      <Badge
                        size="sm"
                        tone={
                          DISCLOSURE_COLORS[node.disclosureLevel] ??
                          'var(--color-muted)'
                        }
                      >
                        {node.disclosureLevel}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              {/* 节点内容 */}
              {node.content && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-muted" />
                    <FieldLabel>内容</FieldLabel>
                  </div>
                  <pre className="mt-1.5 max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded-card border border-border bg-surface-elevated p-3 text-xs leading-relaxed text-foreground">
                    {node.content}
                  </pre>
                </div>
              )}
            </div>

            {/* 版本历史 */}
            <div className="mt-6">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted" />
                <FieldLabel>版本历史</FieldLabel>
              </div>

              {versionsLoading ? (
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 2 }, (_, i) => (
                    <Skeleton key={i} className="h-14 rounded-card" />
                  ))}
                </div>
              ) : versions && versions.length > 0 ? (
                <div className="mt-3 space-y-2" data-testid="version-list">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-card border border-border bg-surface-elevated p-2.5"
                      data-testid={`version-item-${v.version}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 text-muted" />
                          <span className="text-xs font-medium text-foreground">
                            v{v.version}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted">
                          {new Date(v.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      {v.content && (
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted">
                          {v.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">暂无版本记录</p>
              )}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-xs text-muted">
            无法加载节点信息
          </p>
        )}
      </div>
    </motion.aside>
  )
})
