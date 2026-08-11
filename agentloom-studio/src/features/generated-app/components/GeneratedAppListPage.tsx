import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowRight,
  AppWindow,
  Clock,
  WandSparkles,
} from 'lucide-react'

import { Pagination } from '@/shared/components/Pagination'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { staggerList } from '@/shared/lib/motion'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { useToast } from '@/shared/ui/toast'
import {
  useCreateGeneratedApp,
  useGeneratedApps,
  useStartGeneratedAppGenerationRun,
} from '../api'
import { GeneratedAppPublicSharePanel } from './GeneratedAppPublicSharePanel'
import {
  GENERATED_APP_READINESS_LABELS,
  GENERATED_APP_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppReadinessBadgeVariant,
  getGeneratedAppStatusBadgeVariant,
} from '../lib/generatedAppDisplay'
import type { GeneratedApp } from '../types'

const PAGE_SIZE = 12

interface GenerationLaunchState {
  appId: string
  appName: string
  summary: string
  status: 'started' | 'failed'
}

function GeneratedAppCard({ app }: { app: GeneratedApp }) {
  return (
    <Card data-testid="generated-app-card">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={getGeneratedAppStatusBadgeVariant(app.status)} size="sm">
              {GENERATED_APP_STATUS_LABELS[app.status]}
            </Badge>
            <Badge variant={getGeneratedAppReadinessBadgeVariant(app.readiness)} size="sm">
              {GENERATED_APP_READINESS_LABELS[app.readiness.state]}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-sm font-semibold text-foreground">
                {app.appName}
              </h2>
              <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted">
                {app.description}
              </p>
            </div>
            <Link
              to="/generated-apps/$appId"
              params={{ appId: app.id }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover"
            >
              查看详情
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <dl className="grid gap-2 sm:grid-cols-3">
            <div className="min-w-0 rounded-card border border-border bg-surface-elevated p-2.5">
              <dt className="text-[11px] text-muted">阻断项</dt>
              <dd className="mt-1 text-xs font-medium tabular-nums text-foreground">
                {app.readiness.blockingIssueCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-card border border-border bg-surface-elevated p-2.5">
              <dt className="text-[11px] text-muted">Warning</dt>
              <dd className="mt-1 text-xs font-medium tabular-nums text-foreground">
                {app.readiness.warningCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-card border border-border bg-surface-elevated p-2.5">
              <dt className="flex items-center gap-1 text-[11px] text-muted">
                <Clock className="h-3 w-3" />
                更新时间
              </dt>
              <dd className="mt-1 break-words text-xs text-foreground">
                {formatGeneratedAppDateTime(app.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="w-full shrink-0 lg:w-80">
          <GeneratedAppPublicSharePanel app={app} />
        </div>
      </CardContent>
    </Card>
  )
}

export function GeneratedAppListPage() {
  const { notify } = useToast()
  const [prompt, setPrompt] = useState('')
  const [page, setPage] = useState(1)
  const [lastLaunch, setLastLaunch] = useState<GenerationLaunchState | null>(
    null,
  )
  const createGeneratedAppMutation = useCreateGeneratedApp()
  const startGenerationRunMutation = useStartGeneratedAppGenerationRun()
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

      let createdApp: GeneratedApp | null = null

      try {
        createdApp = await createGeneratedAppMutation.mutateAsync({
          prompt: trimmedPrompt,
        })
        const startResult = await startGenerationRunMutation.mutateAsync({
          appId: createdApp.id,
          triggerSource: 'initial',
        })
        const runPassed = startResult.generationRun.status === 'passed'
        setPrompt('')
        setPage(1)
        setLastLaunch({
          appId: startResult.app.id,
          appName: startResult.app.appName,
          summary: `${
            runPassed
              ? startResult.generationRun.summary
              : startResult.generationRun.failureReason ||
                startResult.generationRun.summary
          }（${startResult.gateRuns.length} 个 Gate 已写入证据）`,
          status: runPassed ? 'started' : 'failed',
        })
        notify({
          title: runPassed
            ? '自动生成与验证已完成'
            : '自动生成与验证未通过',
          description: runPassed
            ? '应用已完成当前自动生成与门禁验证，可进入详情查看结果。'
            : startResult.generationRun.failureReason ||
              startResult.generationRun.summary,
          variant: runPassed ? 'success' : 'warning',
        })
      } catch (error) {
        if (createdApp) {
          setPrompt('')
          setPage(1)
          setLastLaunch({
            appId: createdApp.id,
            appName: createdApp.appName,
            summary:
              error instanceof Error
                ? error.message
                : '自动生成与验证启动失败，请进入详情页重试。',
            status: 'failed',
          })
          notify({
            title: '应用已创建，但自动生成启动失败',
            description:
              error instanceof Error
                ? error.message
                : '请进入详情页重新运行自动生成与验证。',
            variant: 'warning',
          })
          return
        }

        notify({
          title: '创建失败',
          description: error instanceof Error ? error.message : '请稍后重试。',
          variant: 'error',
        })
      }
    },
    [createGeneratedAppMutation, notify, prompt, startGenerationRunMutation],
  )

  const isCreatingOrRunning =
    createGeneratedAppMutation.isPending || startGenerationRunMutation.isPending

  return (
    <div className="h-full overflow-auto" data-testid="generated-app-list-page">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          icon={AppWindow}
          title="生成应用"
          description="用一句话创建面向终端用户的定制业务应用。公开分享只有在阻断门禁全绿、且后端 readiness 标记为发布候选时才可启用。"
        />

        <Card>
          <CardContent className="p-4">
            <form className="space-y-2" onSubmit={handleSubmit}>
              <label
                htmlFor="generated-app-prompt"
                className="block text-xs font-medium text-muted"
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
                  disabled={isCreatingOrRunning}
                />
                <Button type="submit" disabled={isCreatingOrRunning} className="shrink-0 gap-2">
                  {isCreatingOrRunning ? (
                    <Spinner size="sm" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  {isCreatingOrRunning ? '正在生成' : '创建并生成应用'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {lastLaunch ? (
          <Card
            className={
              lastLaunch.status === 'started' ? 'border-success/30' : 'border-warning/30'
            }
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h2 className="break-words text-xs font-semibold text-foreground">
                  {lastLaunch.appName}
                </h2>
                <p className="break-words text-xs leading-relaxed text-muted">
                  {lastLaunch.summary}
                </p>
              </div>
              <Link
                to="/generated-apps/$appId"
                params={{ appId: lastLaunch.appId }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors hover:text-primary-hover"
              >
                进入详情
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs text-muted">
              <Spinner size="sm" />
              正在加载生成应用…
            </p>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-44 rounded-card" />
            ))}
          </div>
        ) : null}

        {!isLoading && isError ? (
          <Card className="border-error/30">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
              <div className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">生成应用加载失败</h2>
                  <p className="text-xs text-muted">请稍后重试，或刷新页面后重新查看。</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  重新加载
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!isLoading && !isError && apps.length === 0 ? (
          <EmptyState
            icon={AppWindow}
            title="还没有生成应用"
            description="从上方输入业务需求，系统会先生成 AppSpec 初稿和门禁状态。"
          />
        ) : null}

        {apps.length > 0 ? (
          <section className="space-y-3" aria-label="生成应用列表">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">共 {meta?.total ?? apps.length} 个生成应用</p>
              {isFetching && !isLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Spinner size="sm" />
                  正在刷新
                </span>
              ) : null}
            </div>

            <div className="space-y-3">
              {apps.map((app, index) => (
                <motion.div key={app.id} {...staggerList(index)}>
                  <GeneratedAppCard app={app} />
                </motion.div>
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
