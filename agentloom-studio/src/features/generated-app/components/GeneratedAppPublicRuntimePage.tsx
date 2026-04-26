import type { ReactNode } from 'react'
import {
  AlertTriangle,
  AppWindow,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-react'

import { useGeneratedAppPublicRuntime } from '../api'
import type { GeneratedAppPublicRuntime } from '../types'

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

function PublicRuntimeSuccess({ app }: { app: GeneratedAppPublicRuntime }) {
  const previewUrl = app.runtimeSurface.previewUrl

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

  return <PublicRuntimeSuccess app={data} />
}
