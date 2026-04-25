import { useCallback, useState } from 'react'
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Share2,
  ShieldAlert,
  WandSparkles,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useToast } from '@/shared/ui/toast'
import {
  useCreateGeneratedApp,
  useDisableGeneratedAppPublicShare,
  useEnableGeneratedAppPublicShare,
  useGeneratedApps,
  useRegenerateGeneratedAppPublicShare,
} from '../api'
import {
  GENERATED_APP_READINESS_LABELS,
  GENERATED_APP_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppPublicShareUnavailableReason,
  isGeneratedAppPublicShareEligible,
} from '../lib/generatedAppDisplay'
import type { GeneratedApp } from '../types'

const PAGE_SIZE = 12

function getReadinessBadgeClass(readiness: GeneratedApp['readiness']) {
  switch (readiness.state) {
    case 'publish_candidate':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    case 'trial':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
    case 'blocked':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300'
    default:
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  }
}

function getStatusBadgeClass(status: GeneratedApp['status']) {
  switch (status) {
    case 'published':
    case 'publish_candidate':
      return 'bg-emerald-500/10 text-emerald-300'
    case 'failed':
      return 'bg-rose-500/10 text-rose-300'
    case 'trial_ready':
      return 'bg-amber-500/10 text-amber-300'
    default:
      return 'bg-sky-500/10 text-sky-300'
  }
}

function GeneratedAppShareActions({ app }: { app: GeneratedApp }) {
  const { notify } = useToast()
  const enableShareMutation = useEnableGeneratedAppPublicShare(app.id)
  const regenerateShareMutation = useRegenerateGeneratedAppPublicShare(app.id)
  const disableShareMutation = useDisableGeneratedAppPublicShare(app.id)

  const canCreatePublicShare = isGeneratedAppPublicShareEligible(app.readiness)
  const isMutating =
    enableShareMutation.isPending ||
    regenerateShareMutation.isPending ||
    disableShareMutation.isPending

  const handleEnableShare = useCallback(async () => {
    try {
      await enableShareMutation.mutateAsync()
      notify({
        title: '公开分享已启用',
        description: '生成应用已通过发布门禁，可分发给终端用户。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '公开分享启用失败',
        description: error instanceof Error ? error.message : app.readiness.summary,
        variant: 'error',
      })
    }
  }, [app.readiness.summary, enableShareMutation, notify])

  const handleRegenerateShare = useCallback(async () => {
    try {
      await regenerateShareMutation.mutateAsync()
      notify({
        title: '公开链接已重新生成',
        description: '旧链接会立即失效，请使用新的公开链接。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '重新生成失败',
        description: error instanceof Error ? error.message : app.readiness.summary,
        variant: 'error',
      })
    }
  }, [app.readiness.summary, notify, regenerateShareMutation])

  const handleDisableShare = useCallback(async () => {
    try {
      await disableShareMutation.mutateAsync()
      notify({
        title: '公开分享已关闭',
        description: '旧公开链接会立即失效。',
        variant: 'success',
      })
    } catch (error) {
      notify({
        title: '关闭公开分享失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }, [disableShareMutation, notify])

  const handleCopyPublicUrl = useCallback(async () => {
    if (!app.publicShareUrl) return

    try {
      await navigator.clipboard.writeText(app.publicShareUrl)
      notify({ description: '公开链接已复制到剪贴板', variant: 'success' })
    } catch {
      notify({ description: '复制失败，请手动复制链接。', variant: 'error' })
    }
  }, [app.publicShareUrl, notify])

  if (!canCreatePublicShare) {
    return (
      <div className="space-y-2 border-l border-border pl-3">
        <p className="break-words text-xs text-muted-foreground">
          {app.readiness.summary}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled
          className="w-full justify-center whitespace-normal text-center sm:w-auto"
          title={getGeneratedAppPublicShareUnavailableReason(app.readiness)}
        >
          <ShieldAlert className="mr-2 h-3.5 w-3.5" />
          公开分享不可用
        </Button>
      </div>
    )
  }

  if (app.publicShareEnabled) {
    return (
      <div className="space-y-3 border-l border-emerald-500/40 pl-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>公开分享已启用</span>
          <span className="text-muted-foreground">
            浏览 {app.publicViewCount} 次
          </span>
        </div>

        {app.publicShareUrl ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {app.publicShareUrl}
            </span>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleCopyPublicUrl}
              aria-label={`复制 ${app.appName} 公开链接`}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a
              href={app.publicShareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`打开 ${app.appName} 公开链接`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateShare}
            disabled={isMutating}
          >
            {regenerateShareMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            重新生成
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDisableShare}
            disabled={isMutating}
          >
            {disableShareMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : null}
            关闭分享
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 border-l border-primary/40 pl-3">
      <p className="break-words text-xs text-muted-foreground">
        {app.readiness.summary}
      </p>
      <Button
        size="sm"
        onClick={handleEnableShare}
        disabled={isMutating}
        data-testid={`generated-app-enable-share-${app.id}`}
      >
        {enableShareMutation.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Share2 className="mr-2 h-3.5 w-3.5" />
        )}
        启用公开分享
      </Button>
    </div>
  )
}

function GeneratedAppCard({ app }: { app: GeneratedApp }) {
  return (
    <article
      className="rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid="generated-app-card"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                getStatusBadgeClass(app.status),
              )}
            >
              {GENERATED_APP_STATUS_LABELS[app.status]}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                getReadinessBadgeClass(app.readiness),
              )}
            >
              {GENERATED_APP_READINESS_LABELS[app.readiness.state]}
            </span>
          </div>

          <div className="space-y-1">
            <h2 className="truncate text-base font-semibold text-foreground">
              {app.appName}
            </h2>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {app.description}
            </p>
          </div>

          <dl className="grid gap-3 border-y border-border/70 py-3 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="min-w-0 border-l border-border pl-3">
              <dt>阻断项</dt>
              <dd className="font-medium text-foreground">
                {app.readiness.blockingIssueCount}
              </dd>
            </div>
            <div className="min-w-0 border-l border-border pl-3">
              <dt>Warning</dt>
              <dd className="font-medium text-foreground">
                {app.readiness.warningCount}
              </dd>
            </div>
            <div className="min-w-0 border-l border-border pl-3">
              <dt className="flex items-center gap-1 font-medium text-foreground">
                <Clock className="h-3.5 w-3.5" />
                更新时间
              </dt>
              <dd className="break-words">
                {formatGeneratedAppDateTime(app.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="w-full shrink-0 lg:w-80">
          <GeneratedAppShareActions app={app} />
        </div>
      </div>
    </article>
  )
}

export function GeneratedAppListPage() {
  const { notify } = useToast()
  const [prompt, setPrompt] = useState('')
  const [page, setPage] = useState(1)
  const createGeneratedAppMutation = useCreateGeneratedApp()
  const { data, isError, isFetching, isLoading, refetch } = useGeneratedApps({
    page,
    pageSize: PAGE_SIZE,
  })

  const apps = data?.data ?? []
  const meta = data?.meta

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmedPrompt = prompt.trim()

      if (!trimmedPrompt) {
        notify({
          title: '请输入应用需求',
          description: '用一句话描述你希望交付给终端用户的业务应用。',
          variant: 'warning',
        })
        return
      }

      try {
        await createGeneratedAppMutation.mutateAsync({ prompt: trimmedPrompt })
        setPrompt('')
        setPage(1)
        notify({
          title: '生成任务已创建',
          description: '系统已生成 AppSpec 初稿和 Gate 0-7 门禁检查项。',
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '创建失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [createGeneratedAppMutation, notify, prompt],
  )

  return (
    <div className="h-full overflow-auto" data-testid="generated-app-list-page">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <AppWindow className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold text-foreground">
              生成应用
            </h1>
          </div>
          <p className="max-w-4xl text-sm text-muted-foreground">
            用一句话创建面向终端用户的定制业务应用。公开分享只有在阻断门禁全绿、且后端
            readiness 标记为发布候选时才可启用。
          </p>
        </header>

        <section className="rounded-lg border border-border bg-surface-elevated p-4 shadow-sm">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label
              htmlFor="generated-app-prompt"
              className="text-sm font-medium text-foreground"
            >
              一句话描述你要的应用
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="generated-app-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="例如：自动化中医问诊系统，能逐步提问并生成分析报告"
                maxLength={4000}
                disabled={createGeneratedAppMutation.isPending}
              />
              <Button
                type="submit"
                disabled={createGeneratedAppMutation.isPending}
                className="shrink-0"
              >
                {createGeneratedAppMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="mr-2 h-4 w-4" />
                )}
                创建应用
              </Button>
            </div>
          </form>
        </section>

        {isLoading ? (
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载生成应用…
            </div>
          </section>
        ) : null}

        {!isLoading && isError ? (
          <section className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-300" />
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    生成应用加载失败
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    请稍后重试，或刷新页面后重新查看。
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  重新加载
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {!isLoading && !isError && apps.length === 0 ? (
          <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <AppWindow className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h2 className="mt-3 text-base font-semibold text-foreground">
              还没有生成应用
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              从上方输入业务需求，系统会先生成 AppSpec 初稿和门禁状态。
            </p>
          </section>
        ) : null}

        {apps.length > 0 ? (
          <section className="space-y-3" aria-label="生成应用列表">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                共 {meta?.total ?? apps.length} 个生成应用
              </p>
              {isFetching && !isLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在刷新
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {apps.map((app) => (
                <GeneratedAppCard key={app.id} app={app} />
              ))}
            </div>

            {meta && meta.totalPages > 1 ? (
              <Pagination
                page={page}
                totalPages={meta.totalPages}
                onPageChange={setPage}
                isLoading={isFetching}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
