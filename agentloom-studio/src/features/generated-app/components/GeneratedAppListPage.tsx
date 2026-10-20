import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowRight,
  AppWindow,
  Clock,
  WandSparkles,
} from 'lucide-react'

import { ChatModelSelect, useUsableChatModels } from '@/features/llm'
import { resolveProblemDetail } from '@/shared/api/problemDetail'
import { Pagination } from '@/shared/components/Pagination'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { FormField } from '@/shared/components/form-field/FormField'
import { PageContainer } from '@/shared/components/page-container/PageContainer'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { formatNumber } from '@/shared/lib/format'
import { fadeInUp, staggerList } from '@/shared/lib/motion'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { StatusBadge } from '@/shared/ui/status-badge'
import { useToast } from '@/shared/ui/toast'
import { useCreateGeneratedApp, useGeneratedApps } from '../api'
import { GeneratedAppBindingTargetSelect } from './GeneratedAppBindingTargetSelect'
import { GeneratedAppGenerationProgress } from './GeneratedAppGenerationProgress'
import { GeneratedAppPublicSharePanel } from './GeneratedAppPublicSharePanel'
import {
  GENERATED_APP_READINESS_LABELS,
  GENERATED_APP_STATUS_META,
  formatGeneratedAppDateTime,
  getGeneratedAppReadinessStatusTone,
} from '../lib/generatedAppDisplay'
import type {
  CreatedGeneratedApp,
  GeneratedApp,
  GeneratedAppBindingTarget,
} from '../types'

const PAGE_SIZE = 12

function GeneratedAppCard({ app }: { app: GeneratedApp }) {
  return (
    <Card data-testid="generated-app-card">
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={GENERATED_APP_STATUS_META[app.status].tone} size="sm">
              {GENERATED_APP_STATUS_META[app.status].label}
            </StatusBadge>
            <StatusBadge
              tone={getGeneratedAppReadinessStatusTone(app.readiness)}
              size="sm"
            >
              {GENERATED_APP_READINESS_LABELS[app.readiness.state]}
            </StatusBadge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="break-words text-sm font-semibold text-foreground">
                {app.appName}
              </h2>
              <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">
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
            <div className="min-w-0 rounded-lg border border-border bg-muted p-2.5">
              <dt className="text-2xs text-muted-foreground">阻断项</dt>
              <dd className="mt-1 text-xs font-medium tabular-nums text-foreground">
                {app.readiness.blockingIssueCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-muted p-2.5">
              <dt className="text-2xs text-muted-foreground">Warning</dt>
              <dd className="mt-1 text-xs font-medium tabular-nums text-foreground">
                {app.readiness.warningCount}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border border-border bg-muted p-2.5">
              <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
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
  const [modelConfigId, setModelConfigId] = useState<string | undefined>()
  const [bindingTarget, setBindingTarget] = useState<
    GeneratedAppBindingTarget | undefined
  >()
  const [page, setPage] = useState(1)
  const [lastCreated, setLastCreated] = useState<CreatedGeneratedApp | null>(
    null,
  )
  const createGeneratedAppMutation = useCreateGeneratedApp()
  const usableChatModels = useUsableChatModels()
  const { data, isError, isFetching, isLoading, refetch } = useGeneratedApps({
    page,
    pageSize: PAGE_SIZE,
  })

  const apps = data?.data ?? []
  const meta = data?.meta
  const chatModels = usableChatModels.data ?? []
  // 没有可用 chat 模型时 Gate 0 必然失败（app-spec-model-unavailable），创建前就拦下
  const hasNoUsableChatModel =
    usableChatModels.isSuccess && chatModels.length === 0
  const isCreating = createGeneratedAppMutation.isPending

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
        // 创建即由服务端排队 initial 生成运行，这里只拿 generationRunId 轮询进度
        const createdApp = await createGeneratedAppMutation.mutateAsync({
          prompt: trimmedPrompt,
          modelConfigId,
          bindingTarget,
        })
        setPrompt('')
        setPage(1)
        setLastCreated(createdApp)
        notify({
          title: '应用已创建，正在生成',
          description:
            'AppSpec 生成与 Gate 0–7 验证在后台执行，通常需要几分钟，进度会自动刷新。',
          variant: 'success',
        })
      } catch (error) {
        notify({
          title: '创建失败',
          description: resolveProblemDetail(error, '请稍后重试。'),
          variant: 'error',
        })
      }
    },
    [bindingTarget, createGeneratedAppMutation, modelConfigId, notify, prompt],
  )

  return (
    <PageContainer data-testid="generated-app-list-page">
        <PageHeader
          icon={AppWindow}
          title="生成应用"
          description="用一句话创建面向终端用户的定制业务应用。公开分享只有在阻断门禁全绿、且后端 readiness 标记为发布候选时才可启用。"
        />

        <Card>
          <CardContent className="p-4">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  htmlFor="generated-app-prompt"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  一句话描述你要的应用
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="generated-app-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="例如：一个问答页面：输入问题，调用知识库问答工作流返回答案与引用"
                    maxLength={4000}
                    disabled={isCreating}
                  />
                  <Button
                    type="submit"
                    disabled={isCreating || hasNoUsableChatModel}
                    className="shrink-0"
                  >
                    {isCreating ? <Spinner size="sm" /> : <WandSparkles />}
                    {isCreating ? '正在创建' : '创建并生成应用'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  label="生成 AppSpec 的模型"
                  htmlFor="generated-app-model"
                  hint="只列可用的对话模型；自动时使用账号默认对话模型。"
                >
                  <ChatModelSelect
                    id="generated-app-model"
                    data-testid="generated-app-model-select"
                    value={modelConfigId}
                    onValueChange={setModelConfigId}
                    models={chatModels}
                    disabled={isCreating || hasNoUsableChatModel}
                  />
                </FormField>
                <FormField
                  label="绑定目标"
                  htmlFor="generated-app-binding-target"
                  hint="公开提交会执行它的已发布版本；自动时由模型按需求从候选中选择。"
                >
                  <GeneratedAppBindingTargetSelect
                    id="generated-app-binding-target"
                    value={bindingTarget}
                    onValueChange={setBindingTarget}
                    disabled={isCreating}
                  />
                </FormField>
              </div>

              <AnimatePresence initial={false}>
                {hasNoUsableChatModel ? (
                  <motion.div key="no-chat-model" {...fadeInUp}>
                    <Alert
                      variant="warning"
                      data-testid="generated-app-no-chat-model-warning"
                    >
                      你的账号中还没有可用的对话模型，无法生成 AppSpec。请先到{' '}
                      <Link
                        to="/resources/llm-models"
                        className="font-medium text-foreground underline underline-offset-2"
                      >
                        模型管理
                      </Link>{' '}
                      添加并启用一个对话模型。
                    </Alert>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </form>
          </CardContent>
        </Card>

        <AnimatePresence initial={false}>
          {lastCreated ? (
            <motion.div key={`last-created-${lastCreated.id}`} {...fadeInUp}>
              <Card data-testid="generated-app-last-created">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <h2 className="break-words text-xs font-semibold text-foreground">
                        {lastCreated.appName}
                      </h2>
                      <p className="break-words text-xs leading-relaxed text-muted-foreground">
                        {lastCreated.prompt}
                      </p>
                    </div>
                    <Link
                      to="/generated-apps/$appId"
                      params={{ appId: lastCreated.id }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
                    >
                      进入详情
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                  <GeneratedAppGenerationProgress
                    appId={lastCreated.id}
                    generationRunId={lastCreated.generationRunId}
                    gates={lastCreated.gateResults}
                  />
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {/* 骨架高度对齐真实卡片（状态行 + 标题 + 3 格 dl + 分享面板） */}
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : null}

        {!isLoading && isError ? (
          <Card className="border-error/30">
            <CardContent className="flex items-start gap-3 p-5">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
              <div className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">生成应用加载失败</h2>
                  <p className="text-xs text-muted-foreground">请稍后重试，或刷新页面后重新查看。</p>
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
              <p className="text-xs text-muted-foreground tabular-nums">
                共 {formatNumber(meta?.total ?? apps.length)} 个生成应用
              </p>
              {isFetching && !isLoading ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
    </PageContainer>
  )
}
