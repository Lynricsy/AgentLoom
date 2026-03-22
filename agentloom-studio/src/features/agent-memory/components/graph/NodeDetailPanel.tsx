import { memo } from 'react'
import { X, Clock, FileText, Hash } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useMemoryNodeDetail, useMemoryNodeVersions } from './api'

interface NodeDetailPanelProps {
  instanceId: string
  nodeId: string
  onClose: () => void
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
  const { data: versions, isLoading: versionsLoading } =
    useMemoryNodeVersions(instanceId, nodeId)

  return (
    <div
      className={cn(
        'absolute right-0 top-0 z-20 flex h-full w-[360px] flex-col',
        'border-l border-border/60 bg-background/95 backdrop-blur-md shadow-2xl',
      )}
      data-testid="node-detail-panel"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">节点详情</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0"
          aria-label="关闭详情面板"
          data-testid="node-detail-close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {nodeLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : node ? (
          <>
            {/* 节点基本信息 */}
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  名称
                </p>
                <p className="mt-0.5 text-sm font-medium text-foreground">
                  {node.name}
                </p>
              </div>

              <div className="flex gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    类型
                  </p>
                  <p className="mt-0.5 text-xs text-foreground">
                    {node.nodeType}
                  </p>
                </div>
                {node.domain && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      域
                    </p>
                    <p className="mt-0.5 text-xs text-foreground">
                      {node.domain}
                    </p>
                  </div>
                )}
                {node.disclosureLevel && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      披露等级
                    </p>
                    <p className="mt-0.5 text-xs text-foreground">
                      {node.disclosureLevel}
                    </p>
                  </div>
                )}
              </div>

              {/* 节点内容 */}
              {node.content && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground">
                      内容
                    </p>
                  </div>
                  <pre className="mt-1.5 max-h-[200px] overflow-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
                    {node.content}
                  </pre>
                </div>
              )}
            </div>

            {/* 版本历史 */}
            <div className="mt-6">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">
                  版本历史
                </p>
              </div>

              {versionsLoading ? (
                <div className="mt-3 flex items-center justify-center py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : versions && versions.length > 0 ? (
                <div className="mt-3 space-y-2" data-testid="version-list">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-lg border border-border/60 bg-muted/20 p-2.5"
                      data-testid={`version-item-${v.version}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">
                            v{v.version}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      {v.content && (
                        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                          {v.content}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  暂无版本记录
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            无法加载节点信息
          </p>
        )}
      </div>
    </div>
  )
})
