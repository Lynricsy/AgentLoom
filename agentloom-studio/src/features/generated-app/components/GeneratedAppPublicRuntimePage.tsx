import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  AppWindow,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  useCreateGeneratedAppPublicSubmission,
  useGeneratedAppPublicRuntime,
  useGeneratedAppPublicSubmission,
} from '../api'
import {
  GENERATED_APP_SUBMISSION_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppSubmissionStatusBadgeClass,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppPublicRuntime,
  GeneratedAppPublicSubmission,
} from '../types'

interface GeneratedAppPublicRuntimePageProps {
  token: string
}

interface PublicSectionProps {
  title: string
  children: ReactNode
}

function PublicSection({ title, children }: PublicSectionProps) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="text-sm font-semibold uppercase tracking-normal text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function PublicRuntimeLoading() {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
      data-testid="generated-app-public-runtime-loading"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        正在打开应用…
      </div>
    </main>
  )
}

function PublicRuntimeError({ onRetry }: { onRetry: () => void }) {
  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
      data-testid="generated-app-public-runtime-error"
    >
      <section className="w-full max-w-xl border border-rose-500/30 bg-rose-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <h1 className="break-words text-lg font-semibold text-foreground">
                公开应用不可访问或已关闭
              </h1>
              <p className="break-words text-sm text-muted-foreground">
                这个链接不存在、已被创建者关闭，或应用当前不满足公开访问条件。
              </p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              重新加载
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function stringifyJson(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) {
    return '暂无'
  }

  return JSON.stringify(value, null, 2)
}

function parseSubmissionInput(value: string): Record<string, unknown> {
  const trimmed = value.trim()

  if (!trimmed) {
    return {}
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }

    return { value: parsed }
  } catch {
    return { text: trimmed }
  }
}

function SubmissionStatusBadge({
  status,
}: {
  status: GeneratedAppPublicSubmission['status']
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppSubmissionStatusBadgeClass(status),
      )}
    >
      {GENERATED_APP_SUBMISSION_STATUS_LABELS[status]}
    </span>
  )
}

function PublicSubmissionJsonPanel({
  label,
  value,
}: {
  label: string
  value: Record<string, unknown> | null
}) {
  return (
    <div className="min-w-0 space-y-2">
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        {stringifyJson(value)}
      </pre>
    </div>
  )
}

function PublicSubmissionResult({
  submission,
}: {
  submission: GeneratedAppPublicSubmission
}) {
  return (
    <article
      className="space-y-4 border border-border bg-surface-elevated p-4"
      data-testid="generated-app-public-submission-result"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SubmissionStatusBadge status={submission.status} />
            <code className="break-all bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {submission.id}
            </code>
          </div>
          <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="border-l border-border pl-3">
              <dt>匿名会话</dt>
              <dd className="break-all text-foreground">
                {submission.anonymousSessionId}
              </dd>
            </div>
            <div className="border-l border-border pl-3">
              <dt>AppSpec 版本</dt>
              <dd className="text-foreground">v{submission.appSpecVersion}</dd>
            </div>
            <div className="border-l border-border pl-3">
              <dt>更新时间</dt>
              <dd className="text-foreground">
                {formatGeneratedAppDateTime(submission.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PublicSubmissionJsonPanel label="Input" value={submission.input} />
        <PublicSubmissionJsonPanel label="Result" value={submission.result} />
        <PublicSubmissionJsonPanel label="Report" value={submission.report} />
        <div className="min-w-0 space-y-2">
          <h3 className="text-sm font-medium text-foreground">Error</h3>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            {submission.errorMessage?.trim() || '暂无'}
          </pre>
        </div>
      </div>
    </article>
  )
}

function PublicRuntimeSuccess({
  app,
  token,
}: {
  app: GeneratedAppPublicRuntime
  token: string
}) {
  const previewUrl = app.runtimeSurface.previewUrl
  const [submissionText, setSubmissionText] = useState('')
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const createSubmissionMutation = useCreateGeneratedAppPublicSubmission(token)
  const submissionQuery = useGeneratedAppPublicSubmission(
    token,
    submissionId ?? undefined,
  )
  const visibleSubmission =
    submissionQuery.data ?? createSubmissionMutation.data ?? null

  const placeholder = useMemo(() => {
    const firstPage = app.appSpec.pages[0]

    if (firstPage) {
      return `可以直接输入文字，也可以输入 JSON，例如：\n{"需求":"${firstPage.purpose}","补充说明":"请按实际情况填写"}`
    }

    return '可以直接输入文字，也可以输入 JSON，例如：\n{"需求":"请根据我的情况生成报告"}'
  }, [app.appSpec.pages])

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = submissionText.trim()

      if (!trimmed) {
        setFormError('请输入要提交给应用的内容。')
        return
      }

      setFormError(null)

      try {
        const submission = await createSubmissionMutation.mutateAsync({
          input: parseSubmissionInput(trimmed),
          clientContext: {
            submittedAt: new Date().toISOString(),
          },
        })
        setSubmissionId(submission.id)
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : '提交失败，请稍后重试。',
        )
      }
    },
    [createSubmissionMutation, submissionText],
  )

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-testid="generated-app-public-runtime-page"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-5 pb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AppWindow className="h-4 w-4" />
            <span className="truncate">公开应用</span>
          </div>
          <div className="space-y-3">
            <h1 className="break-words text-3xl font-semibold text-foreground sm:text-4xl">
              {app.title}
            </h1>
            <p className="max-w-3xl break-words text-base leading-7 text-muted-foreground">
              {app.description}
            </p>
          </div>
        </header>

        <section className="border-y border-border bg-surface-elevated px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {app.dataUseNotice}
            </p>
          </div>
        </section>

        <PublicSection title="应用目标">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-medium text-foreground">概要</h3>
              <p className="break-words text-sm leading-6 text-muted-foreground">
                {app.appSpec.summary}
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <h3 className="text-sm font-medium text-foreground">用户目标</h3>
              <p className="break-words text-sm leading-6 text-muted-foreground">
                {app.appSpec.userGoal}
              </p>
            </div>
          </div>
        </PublicSection>

        <PublicSection title="参与者">
          {app.appSpec.actors.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {app.appSpec.actors.map((actor) => (
                <li
                  key={actor}
                  className="max-w-full break-words border border-border bg-muted px-3 py-1.5 text-sm text-foreground"
                >
                  {actor}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">暂无参与者信息。</p>
          )}
        </PublicSection>

        <PublicSection title="页面和流程">
          {app.appSpec.pages.length > 0 ? (
            <ol className="divide-y divide-border">
              {app.appSpec.pages.map((page) => (
                <li key={page.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
                    <div className="min-w-0 space-y-1">
                      <h3 className="break-words text-sm font-medium text-foreground">
                        {page.name}
                      </h3>
                      <p className="break-all text-xs text-muted-foreground">
                        {page.id}
                      </p>
                    </div>
                    <p className="min-w-0 break-words text-sm leading-6 text-muted-foreground">
                      {page.purpose}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              暂无可公开展示的页面信息。
            </p>
          )}
        </PublicSection>

        <PublicSection title="运行入口">
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <span className="truncate">打开运行预览</span>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </a>
          ) : (
            <p className="break-words text-sm text-muted-foreground">
              运行界面尚在准备中。
            </p>
          )}
        </PublicSection>

        <PublicSection title="提交给应用">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <form className="min-w-0 space-y-3" onSubmit={handleSubmit}>
              <label
                htmlFor="generated-app-public-submission"
                className="text-sm font-medium text-foreground"
              >
                提交内容
              </label>
              <textarea
                id="generated-app-public-submission"
                value={submissionText}
                onChange={(event) => setSubmissionText(event.target.value)}
                placeholder={placeholder}
                rows={8}
                className="w-full resize-y border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                disabled={createSubmissionMutation.isPending}
              />
              {formError ? (
                <p className="break-words text-sm text-rose-300">{formError}</p>
              ) : null}
              <Button
                type="submit"
                disabled={createSubmissionMutation.isPending}
              >
                {createSubmissionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                提交给应用
              </Button>
            </form>

            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  提交结果
                </h3>
                {submissionQuery.isFetching ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在刷新
                  </span>
                ) : null}
              </div>

              {visibleSubmission ? (
                <PublicSubmissionResult submission={visibleSubmission} />
              ) : (
                <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                  提交后会在这里显示 submission
                  id、状态、输入、结果、报告和错误信息。
                </div>
              )}
            </div>
          </div>
        </PublicSection>

        <div className="mt-auto border-t border-border py-4" />
      </div>
    </main>
  )
}

export function GeneratedAppPublicRuntimePage({
  token,
}: GeneratedAppPublicRuntimePageProps) {
  const { data, isError, isLoading, refetch } =
    useGeneratedAppPublicRuntime(token)

  if (isLoading) {
    return <PublicRuntimeLoading />
  }

  if (!data || isError) {
    return <PublicRuntimeError onRetry={() => void refetch()} />
  }

  return <PublicRuntimeSuccess app={data} token={token} />
}
