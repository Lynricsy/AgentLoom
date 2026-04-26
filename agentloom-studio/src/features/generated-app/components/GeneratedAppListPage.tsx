import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  AppWindow,
  Clock,
  Loader2,
  WandSparkles,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useToast } from '@/shared/ui/toast'
import { useCreateGeneratedApp, useGeneratedApps } from '../api'
import { GeneratedAppPublicSharePanel } from './GeneratedAppPublicSharePanel'
import {
  GENERATED_APP_READINESS_LABELS,
  GENERATED_APP_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppReadinessBadgeClass,
  getGeneratedAppStatusBadgeClass,
} from '../lib/generatedAppDisplay'
import type { GeneratedApp } from '../types'

const PAGE_SIZE = 12

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
                getGeneratedAppStatusBadgeClass(app.status),
              )}
            >
              {GENERATED_APP_STATUS_LABELS[app.status]}
            </span>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                getGeneratedAppReadinessBadgeClass(app.readiness),
              )}
            >
              {GENERATED_APP_READINESS_LABELS[app.readiness.state]}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-base font-semibold text-foreground">
                {app.appName}
              </h2>
              <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                {app.description}
              </p>
            </div>
            <Link
              to="/generated-apps/$appId"
              params={{ appId: app.id }}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
            >
              查看详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
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
          <GeneratedAppPublicSharePanel app={app} />
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
            <h1 className="text-2xl font-semibold text-foreground">生成应用</h1>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                >
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
