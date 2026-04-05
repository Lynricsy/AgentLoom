import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  Copy,
  Eye,
  FileUp,
  Loader2,
  UserRound,
} from 'lucide-react'
import { WorkflowPreviewCanvas } from '@/features/canvas'
import { useCreateWorkflow } from '@/features/workflow/api/workflowMutations'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { useToast } from '@/shared/ui/toast'
import { useImportAgentShare } from '../api/shareMutations'
import { usePublicShare } from '../api/shareQueries'
import type {
  ImportAgentShareResponse,
  PublicAgentShareData,
  PublicShareData,
} from '../types'

function formatDateTime(value: string | null): string {
  if (!value) return '无'
  return new Date(value).toLocaleString('zh-CN')
}

function getShareTypeBadgeClass(
  shareType: PublicShareData['shareType'],
): string {
  return shareType === 'read_only'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function getShareTypeLabel(shareType: PublicShareData['shareType']): string {
  return shareType === 'read_only' ? '仅查看' : '可导入'
}

function getResourceTypeLabel(
  resourceType: PublicShareData['resourceType'],
): string {
  return resourceType === 'agent' ? 'Agent' : '工作流'
}

function AgentImportReportCard({
  result,
  onOpenAgent,
}: {
  result: ImportAgentShareResponse
  onOpenAgent: () => void
}) {
  return (
    <section className="border-t border-border/40 bg-emerald-500/5 px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-background/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">
              Agent 已导入
            </h2>
            <p className="text-xs text-muted-foreground">
              已创建为 “{result.name}”。下面是这次导入的资源处理结果。
            </p>
          </div>
          <Button size="sm" onClick={onOpenAgent}>
            打开 Agent
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-xs text-muted-foreground">已复制</div>
            <div className="mt-1 text-lg font-semibold">
              {result.summary.cloned}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-xs text-muted-foreground">已清空</div>
            <div className="mt-1 text-lg font-semibold">
              {result.summary.cleared}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-xs text-muted-foreground">待重绑</div>
            <div className="mt-1 text-lg font-semibold">
              {result.summary.needsRebind}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card p-3">
            <div className="text-xs text-muted-foreground">跳过临时资源</div>
            <div className="mt-1 text-lg font-semibold">
              {result.summary.skippedEphemeral}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {result.report.map((item, index) => (
            <div
              key={`${item.resourceType}-${item.targetResourceId ?? item.sourceResourceId ?? index}`}
              className="rounded-lg border border-border/60 bg-card p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.message}
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    item.outcome === 'cloned' &&
                      'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
                    item.outcome === 'cleared' &&
                      'border-amber-500/20 bg-amber-500/10 text-amber-400',
                    item.outcome === 'needs_rebind' &&
                      'border-rose-500/20 bg-rose-500/10 text-rose-400',
                    item.outcome === 'skipped_ephemeral' &&
                      'border-slate-500/20 bg-slate-500/10 text-slate-400',
                  )}
                >
                  {item.outcome === 'cloned'
                    ? '已复制'
                    : item.outcome === 'cleared'
                      ? '已清空'
                      : item.outcome === 'needs_rebind'
                        ? '待重绑'
                        : '已跳过'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PublicSharePage() {
  const { token } = useParams({ from: '/s/$token' })
  const navigate = useNavigate()
  const { notify } = useToast()
  const { data, isLoading, error } = usePublicShare(token)
  const createWorkflowMutation = useCreateWorkflow()
  const importAgentMutation = useImportAgentShare()
  const [agentImportResult, setAgentImportResult] =
    useState<ImportAgentShareResponse | null>(null)

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
            {is404
              ? '分享链接不存在'
              : isExpired
                ? '分享链接已过期'
                : '加载失败'}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {is404
              ? '该分享链接无效或已被撤销。'
              : isExpired
                ? '该分享链接已过期或已被撤销，无法继续访问。'
                : '加载分享内容时发生错误，请稍后重试。'}
          </p>
          <Button onClick={() => void navigate({ to: '/' })}>返回首页</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const importPending =
    data.resourceType === 'workflow'
      ? createWorkflowMutation.isPending
      : importAgentMutation.isPending

  const description =
    data.resourceType === 'agent'
      ? data.agentDescription
      : data.workflowDescription

  const handleImport = () => {
    if (data.shareType !== 'copyable') return

    if (data.resourceType === 'workflow') {
      createWorkflowMutation.mutate(
        {
          name: data.workflowName,
          ...(data.workflowDescription
            ? { description: data.workflowDescription }
            : {}),
          shareToken: token,
        },
        {
          onSuccess: (result) => {
            notify({
              description: '已导入到你的工作流列表',
              variant: 'success',
            })
            void navigate({
              to: '/workflows/$workflowId',
              params: { workflowId: result.id },
            })
          },
          onError: () => {
            notify({ description: '导入失败，请确认已登录', variant: 'error' })
          },
        },
      )
      return
    }

    importAgentMutation.mutate(token, {
      onSuccess: (result) => {
        setAgentImportResult(result)
        notify({
          description: `Agent 已导入：复制 ${result.summary.cloned} 项，待重绑 ${result.summary.needsRebind} 项`,
          variant: 'success',
        })
      },
      onError: () => {
        notify({
          description: 'Agent 导入失败，请确认已登录',
          variant: 'error',
        })
      },
    })
  }

  const handleOpenImportedAgent = () => {
    if (!agentImportResult) return
    void navigate({
      to: '/agents/$agentId',
      params: { agentId: agentImportResult.agentDefinitionId },
    })
  }

  const agentMeta =
    data.resourceType === 'agent' ? (data as PublicAgentShareData) : null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      data-testid="public-share-page"
    >
      <header className="border-b border-border/60 bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {getResourceTypeLabel(data.resourceType)}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                  getShareTypeBadgeClass(data.shareType),
                )}
              >
                {data.shareType === 'read_only' ? (
                  <>
                    <Eye className="h-3 w-3" />
                    {getShareTypeLabel(data.shareType)}
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    {getShareTypeLabel(data.shareType)}
                  </>
                )}
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                {data.title}
              </h1>
              {description ? (
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" />
                {data.author.displayName}
              </span>
              <span>创建于 {formatDateTime(data.createdAt)}</span>
              {data.expiresAt ? (
                <span>有效期至 {formatDateTime(data.expiresAt)}</span>
              ) : null}
              <span>{data.nodeCount} 个节点</span>
              <span>{data.edgeCount} 条连线</span>
              {agentMeta ? (
                <span>运行模式: {agentMeta.runtimeMode}</span>
              ) : null}
              {agentMeta?.sandboxLifecycle ? (
                <span>沙箱生命周期: {agentMeta.sandboxLifecycle}</span>
              ) : null}
            </div>
          </div>

          {data.shareType === 'copyable' ? (
            <Button
              className="shrink-0"
              onClick={handleImport}
              disabled={importPending}
              data-testid="btn-copy-to-workspace"
            >
              {importPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {data.resourceType === 'agent'
                ? '导入到我的 Agent'
                : '复制到我的工作流'}
            </Button>
          ) : null}
        </div>
      </header>

      {agentImportResult ? (
        <AgentImportReportCard
          result={agentImportResult}
          onOpenAgent={handleOpenImportedAgent}
        />
      ) : null}

      <div className="flex-1">
        <WorkflowPreviewCanvas
          className="h-full"
          definition={data.definition}
          showControls
          showMiniMap
          testId="public-share-preview"
        />
      </div>

      <footer className="border-t border-border/40 bg-muted/30 px-4 py-2 text-center sm:px-6">
        <p className="text-xs text-muted-foreground">
          分享作者：{data.author.displayName}
          {data.author.email ? ` · ${data.author.email}` : ''}
        </p>
      </footer>
    </div>
  )
}
