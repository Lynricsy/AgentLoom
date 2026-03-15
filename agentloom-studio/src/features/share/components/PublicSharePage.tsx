import { useParams, useNavigate } from '@tanstack/react-router'
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react'
import { Eye, Copy, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useToast } from '@/shared/ui/toast'
import { usePublicShare, useCopyShare } from '../api'

import '@xyflow/react/dist/style.css'

export function PublicSharePage() {
  const { token } = useParams({ from: '/s/$token' })
  const navigate = useNavigate()
  const { notify } = useToast()
  const { data, isLoading, error } = usePublicShare(token)
  const copyMutation = useCopyShare()

  const handleCopyToWorkspace = () => {
    copyMutation.mutate(token, {
      onSuccess: (result) => {
        notify({ description: '已复制到您的工作区', variant: 'success' })
        void navigate({ to: '/workflows/$workflowId', params: { workflowId: result.workflowDefinitionId } })
      },
      onError: () => {
        notify({ description: '复制失败，请确认您已登录', variant: 'error' })
      },
    })
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">加载分享内容...</p>
        </div>
      </div>
    )
  }

  if (error) {
    const httpError = error as unknown as { response?: { status?: number } }
    const status = httpError?.response?.status ?? 500
    const is404 = status === 404
    const isExpired = status === 410

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-semibold text-foreground">
            {is404 ? '分享链接不存在' : isExpired ? '分享链接已过期' : '加载失败'}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {is404
              ? '该分享链接无效或已被撤销。'
              : isExpired
                ? '该分享链接已过期或已被撤销，无法继续访问。'
                : '加载分享内容时发生错误，请稍后重试。'}
          </p>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={() => void navigate({ to: '/' })}
          >
            返回首页
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const nodes = (data.definition.nodes ?? []) as Node[]
  const edges = (data.definition.edges ?? []) as Edge[]
  const viewport = data.definition.viewport

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="public-share-page">
      <header className="flex items-center justify-between border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">{data.workflowName}</h1>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
              data.shareType === 'read_only'
                ? 'border-sky-200 bg-sky-50 text-sky-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700',
            )}
          >
            {data.shareType === 'read_only' ? (
              <><Eye className="h-3 w-3" /> 仅查看</>
            ) : (
              <><Copy className="h-3 w-3" /> 可复制</>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {data.shareType === 'copyable' && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              onClick={handleCopyToWorkspace}
              disabled={copyMutation.isPending}
              data-testid="btn-copy-to-workspace"
            >
              {copyMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              复制到我的工作流
            </button>
          )}
        </div>
      </header>

      {data.workflowDescription && (
        <div className="border-b border-border/40 bg-muted/30 px-4 py-2 sm:px-6">
          <p className="text-sm text-muted-foreground">{data.workflowDescription}</p>
        </div>
      )}

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          defaultViewport={viewport}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap />
        </ReactFlow>
      </div>

      <footer className="border-t border-border/40 bg-muted/30 px-4 py-2 text-center sm:px-6">
        <p className="text-xs text-muted-foreground">
          由 AgentLoom 提供技术支持
          {data.expiresAt && (
            <> &middot; 有效期至 {new Date(data.expiresAt).toLocaleDateString('zh-CN')}</>
          )}
        </p>
      </footer>
    </div>
  )
}
