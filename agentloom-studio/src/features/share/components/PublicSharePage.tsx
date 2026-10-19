import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  Copy,
  Eye,
  FileUp,
  Link2,
  Loader2,
  UserRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { WorkflowPreviewCanvas } from '@/features/canvas'
import { useCreateWorkflow } from '@/features/workflow'
import { BrandMark } from '@/shared/components/brand/BrandMark'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { formatDateTime } from '@/shared/lib/format'
import { Badge, type BadgeProps } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import { useImportAgentShare } from '../api/shareMutations'
import { usePublicShare } from '../api/shareQueries'
import type {
  AgentShareImportReportOutcome,
  ImportAgentShareResponse,
  PublicShareData,
} from '../types'

const IMPORT_OUTCOME_META: Record<
  AgentShareImportReportOutcome,
  { label: string; variant: NonNullable<BadgeProps['variant']> }
> = {
  cloned: { label: '已复制', variant: 'success' },
  cleared: { label: '已清空', variant: 'warning' },
  needs_rebind: { label: '待重绑', variant: 'error' },
  skipped_ephemeral: { label: '已跳过', variant: 'secondary' },
}

interface ShareMetaItem {
  key: string
  label: string
  icon?: LucideIcon
}

/** 头部元信息条目；Agent 额外补运行模式与沙箱生命周期 */
function buildShareMetaItems(share: PublicShareData): ShareMetaItem[] {
  const items: ShareMetaItem[] = [
    { key: 'author', label: share.author.displayName, icon: UserRound },
    { key: 'created', label: `创建于 ${formatDateTime(share.createdAt)}` },
  ]

  if (share.expiresAt) {
    items.push({
      key: 'expires',
      label: `有效期至 ${formatDateTime(share.expiresAt)}`,
    })
  }

  items.push(
    { key: 'nodes', label: `${share.nodeCount} 个节点` },
    { key: 'edges', label: `${share.edgeCount} 条连线` },
  )

  if (share.resourceType === 'agent') {
    items.push({ key: 'runtime', label: `运行模式：${share.runtimeMode}` })

    if (share.sandboxLifecycle) {
      items.push({
        key: 'sandbox',
        label: `沙箱生命周期：${share.sandboxLifecycle}`,
      })
    }
  }

  return items
}

/**
 * 公开分享页外壳：无侧栏、无应用导航，只保留品牌头部。
 * `/s/*` 是公开路由，__root 直接渲染 Outlet，不需要 fixed 覆盖层。
 */
function PublicShareShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-dvh flex-col bg-background"
      data-testid="public-share-page"
    >
      <div
        className="flex h-14 shrink-0 items-center px-4 sm:px-6"
        style={{ backgroundImage: 'var(--color-brand-gradient)' }}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="text-sm font-semibold tracking-tight text-white">
            AgentLoom
          </span>
          <span className="text-xs text-white/70">公开分享</span>
        </div>
      </div>

      {children}
    </div>
  )
}

/** 居中留白容器：加载/错误/空态共用，保持与内容区同一栏宽 */
function CenteredSlot({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

function AgentImportReportCard({
  result,
  onOpenAgent,
}: {
  result: ImportAgentShareResponse
  onOpenAgent: () => void
}) {
  const summaryItems = [
    { label: '已复制', value: result.summary.cloned },
    { label: '已清空', value: result.summary.cleared },
    { label: '待重绑', value: result.summary.needsRebind },
    { label: '跳过临时资源', value: result.summary.skippedEphemeral },
  ]

  return (
    <section className="border-b border-border bg-surface">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Agent 已导入</h2>
            <p className="text-xs text-muted-foreground">
              已创建为 “{result.name}”。下面是这次导入的资源处理结果。
            </p>
          </div>
          <Button size="sm" onClick={onOpenAgent}>
            打开 Agent
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-muted p-3"
            >
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {result.report.map((item, index) => {
            const outcomeMeta = IMPORT_OUTCOME_META[item.outcome]

            return (
              <div
                key={`${item.resourceType}-${item.targetResourceId ?? item.sourceResourceId ?? index}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{item.message}</div>
                </div>
                <Badge variant={outcomeMeta.variant}>{outcomeMeta.label}</Badge>
              </div>
            )
          })}
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
      <PublicShareShell>
        <div className="shrink-0 border-b border-border bg-surface" aria-busy>
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 sm:px-6">
            <span className="sr-only">加载分享内容…</span>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="min-h-0 flex-1 px-4 py-4 sm:px-6">
          <Skeleton className="mx-auto h-full w-full max-w-5xl rounded-lg" />
        </div>
      </PublicShareShell>
    )
  }

  if (error) {
    const httpError = error as unknown as { response?: { status?: number } }
    const status = httpError?.response?.status ?? 500
    const is404 = status === 404
    const isExpired = status === 410

    return (
      <PublicShareShell>
        <CenteredSlot>
          <EmptyState
            icon={AlertTriangle}
            tone="var(--color-warning)"
            title={
              is404
                ? '分享链接不存在'
                : isExpired
                  ? '分享链接已过期'
                  : '加载失败'
            }
            description={
              is404
                ? '该分享链接无效或已被撤销。'
                : isExpired
                  ? '该分享链接已过期或已被撤销，无法继续访问。'
                  : '加载分享内容时发生错误，请稍后重试。'
            }
            action={
              <Button onClick={() => void navigate({ to: '/' })}>返回首页</Button>
            }
          />
        </CenteredSlot>
      </PublicShareShell>
    )
  }

  // 空态：请求已结束但没有拿到分享内容（例如链接被清理）
  if (!data) {
    return (
      <PublicShareShell>
        <CenteredSlot>
          <EmptyState
            icon={Link2}
            title="没有可展示的分享内容"
            description="这个链接没有返回任何可预览的内容，请向分享者确认链接是否仍然有效。"
            action={
              <Button variant="outline" onClick={() => void navigate({ to: '/' })}>
                返回首页
              </Button>
            }
          />
        </CenteredSlot>
      </PublicShareShell>
    )
  }

  const importPending =
    data.resourceType === 'workflow'
      ? createWorkflowMutation.isPending
      : importAgentMutation.isPending

  // 描述按资源类型取各自字段，避免回落到内部 title 摘要
  const description =
    data.resourceType === 'agent'
      ? data.agentDescription
      : data.workflowDescription
  const resourceLabel = data.resourceType === 'agent' ? 'Agent' : '工作流'
  const metaItems = buildShareMetaItems(data)
  const isCopyable = data.shareType === 'copyable'

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

  return (
    <PublicShareShell>
      <div className="shrink-0 border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{resourceLabel}</Badge>
              <Badge variant={isCopyable ? 'success' : 'info'}>
                {isCopyable ? (
                  <Copy className="size-3" />
                ) : (
                  <Eye className="size-3" />
                )}
                {isCopyable ? '可导入' : '仅查看'}
              </Badge>
            </div>

            <PageHeader title={data.title} description={description} />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              {metaItems.map((item) => (
                <span key={item.key} className="inline-flex min-w-0 items-center gap-1">
                  {item.icon ? <item.icon className="size-3.5 shrink-0" /> : null}
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          {isCopyable ? (
            <Button
              className="shrink-0"
              onClick={handleImport}
              disabled={importPending}
              data-testid="btn-copy-to-workspace"
            >
              {importPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileUp />
              )}
              {data.resourceType === 'agent'
                ? '导入到我的 Agent'
                : '复制到我的工作流'}
            </Button>
          ) : null}
        </div>
      </div>

      {agentImportResult ? (
        <AgentImportReportCard
          result={agentImportResult}
          onOpenAgent={handleOpenImportedAgent}
        />
      ) : null}

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-4 py-4 sm:px-6">
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            <WorkflowPreviewCanvas
              className="h-full"
              definition={data.definition}
              showControls
              showMiniMap
              testId="public-share-preview"
              emptyFallback={
                <EmptyState
                  className="h-full border-0"
                  icon={Workflow}
                  title="这个分享没有可预览的画布"
                  description={`分享者尚未在这个${resourceLabel}中放置任何节点。`}
                />
              }
            />
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-surface px-4 py-2.5 text-center sm:px-6">
        <p className="break-all text-xs text-muted-foreground">
          分享作者：{data.author.displayName}
        </p>
      </footer>
    </PublicShareShell>
  )
}
