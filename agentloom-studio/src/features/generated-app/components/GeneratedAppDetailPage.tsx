import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileCode2,
  Loader2,
  ListChecks,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useGeneratedApp } from '../api'
import { GeneratedAppPublicSharePanel } from './GeneratedAppPublicSharePanel'
import { GeneratedAppSubmissionsPanel } from './GeneratedAppSubmissionsPanel'
import {
  GENERATED_APP_GATE_STATUS_LABELS,
  GENERATED_APP_READINESS_LABELS,
  GENERATED_APP_STATUS_LABELS,
  formatGeneratedAppDateTime,
  getGeneratedAppGateStatusBadgeClass,
  getGeneratedAppReadinessBadgeClass,
  getGeneratedAppStatusBadgeClass,
  isGeneratedAppPublicShareEligible,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedApp,
  GeneratedAppAcceptanceScenario,
  GeneratedAppGateResult,
} from '../types'

interface GeneratedAppDetailPageProps {
  appId: string
}

interface DetailSectionProps {
  title: string
  description?: string
  children: ReactNode
}

function DetailSection({ title, description, children }: DetailSectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="break-words text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function BooleanValue({ value }: { value: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        value
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {value ? '是' : '否'}
    </span>
  )
}

function IdList({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-muted-foreground">尚未生成</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <code
          key={value}
          className="break-all rounded bg-muted px-1.5 py-0.5 text-xs text-foreground"
        >
          {value}
        </code>
      ))}
    </div>
  )
}

function ScenarioStepGroup({
  label,
  steps,
}: {
  label: string
  steps: string[]
}) {
  return (
    <div className="min-w-0 space-y-2">
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </h4>
      {steps.length > 0 ? (
        <ol className="space-y-1 text-sm text-muted-foreground">
          {steps.map((step, index) => (
            <li key={`${label}-${index}`} className="break-words">
              {step}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">尚未生成</p>
      )}
    </div>
  )
}

function AcceptanceScenarioList({
  scenarios,
}: {
  scenarios: GeneratedAppAcceptanceScenario[]
}) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-muted-foreground">尚未生成验收场景。</p>
  }

  return (
    <div className="divide-y divide-border">
      {scenarios.map((scenario) => (
        <article
          key={scenario.id}
          className="space-y-4 py-4 first:pt-0 last:pb-0"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {scenario.id}
              </code>
              <h3 className="break-words text-sm font-semibold text-foreground">
                {scenario.title}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">关联需求</span>
              <IdList values={scenario.requirementIds} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ScenarioStepGroup label="Given" steps={scenario.given} />
            <ScenarioStepGroup label="When" steps={scenario.when} />
            <ScenarioStepGroup label="Then" steps={scenario.then} />
          </div>
        </article>
      ))}
    </div>
  )
}

function GateStatusBadge({ gate }: { gate: GeneratedAppGateResult }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
        getGeneratedAppGateStatusBadgeClass(gate.status),
      )}
    >
      {GENERATED_APP_GATE_STATUS_LABELS[gate.status]}
    </span>
  )
}

function GateResultsTable({ gates }: { gates: GeneratedAppGateResult[] }) {
  if (gates.length === 0) {
    return <p className="text-sm text-muted-foreground">尚未写入 Gate 结果。</p>
  }

  return (
    <div className="overflow-x-auto" data-testid="generated-app-gates">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 font-medium">Order</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">Name</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">
              Blocking
            </th>
            <th className="min-w-72 px-3 py-2 font-medium">Summary</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">
              Evidence
            </th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {gates
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((gate) => (
              <tr key={gate.gateId} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  Gate {gate.order}
                </td>
                <td className="min-w-48 px-3 py-3">
                  <div className="space-y-1">
                    <p className="break-words font-medium text-foreground">
                      {gate.name}
                    </p>
                    <code className="break-all text-xs text-muted-foreground">
                      {gate.gateId}
                    </code>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <GateStatusBadge gate={gate} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {gate.blocking ? '阻断' : '非阻断'}
                </td>
                <td className="px-3 py-3">
                  <p className="break-words text-muted-foreground">
                    {gate.summary}
                  </p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {gate.evidence.length}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                  {formatGeneratedAppDateTime(gate.updatedAt)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

function TraceabilityTable({ app }: { app: GeneratedApp }) {
  const rows = app.appSpec.traceability

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">尚未生成追踪矩阵。</p>
  }

  return (
    <div className="overflow-x-auto" data-testid="generated-app-traceability">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 font-medium">
              Requirement
            </th>
            <th className="min-w-56 px-3 py-2 font-medium">Scenarios</th>
            <th className="min-w-56 px-3 py-2 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.requirementId} className="align-top">
              <td className="px-3 py-3">
                <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                  {row.requirementId}
                </code>
              </td>
              <td className="px-3 py-3">
                <IdList values={row.scenarioIds} />
              </td>
              <td className="px-3 py-3">
                <IdList values={row.evidenceIds} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ArtifactLink({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm font-medium text-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 break-all text-primary hover:text-primary/80"
          >
            <span className="break-all">{url}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <span className="text-muted-foreground">尚未生成</span>
        )}
      </dd>
    </div>
  )
}

function AppSpecSection({ app }: { app: GeneratedApp }) {
  const { appSpec } = app

  return (
    <DetailSection
      title="AppSpec 摘要"
      description="从自然语言需求归一化出的可执行规格。"
    >
      <dl className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <dt className="text-sm font-medium text-foreground">Summary</dt>
          <dd className="break-words text-sm text-muted-foreground">
            {appSpec.summary}
          </dd>
        </div>
        <div className="space-y-1 md:col-span-2">
          <dt className="text-sm font-medium text-foreground">User goal</dt>
          <dd className="break-words text-sm text-muted-foreground">
            {appSpec.userGoal}
          </dd>
        </div>
        <div className="space-y-2">
          <dt className="text-sm font-medium text-foreground">Actors</dt>
          <dd>
            <IdList values={appSpec.actors} />
          </dd>
        </div>
        <div className="space-y-2">
          <dt className="text-sm font-medium text-foreground">Data policy</dt>
          <dd className="space-y-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span>公开提交持久化</span>
              <BooleanValue
                value={appSpec.dataPolicy.publicSubmissionsPersisted}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span>创建者可删除提交</span>
              <BooleanValue
                value={appSpec.dataPolicy.creatorCanDeleteSubmissions}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span>终端用户需登录</span>
              <BooleanValue value={appSpec.dataPolicy.endUserLoginRequired} />
            </div>
          </dd>
        </div>
        <div className="space-y-2 md:col-span-2">
          <dt className="text-sm font-medium text-foreground">
            Core requirements
          </dt>
          <dd>
            <ul className="divide-y divide-border">
              {appSpec.coreRequirements.map((requirement) => (
                <li key={requirement.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <code className="shrink-0 text-xs text-muted-foreground">
                      {requirement.id}
                    </code>
                    <span className="break-words text-sm text-muted-foreground">
                      {requirement.text}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="space-y-2 md:col-span-2">
          <dt className="text-sm font-medium text-foreground">Non-goals</dt>
          <dd>
            {appSpec.nonGoals.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {appSpec.nonGoals.map((nonGoal) => (
                  <li key={nonGoal} className="break-words">
                    {nonGoal}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-muted-foreground">尚未声明</span>
            )}
          </dd>
        </div>
      </dl>
    </DetailSection>
  )
}

export function GeneratedAppDetailPage({ appId }: GeneratedAppDetailPageProps) {
  const { data: app, isError, isLoading, refetch } = useGeneratedApp(appId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!app || isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="h-8 w-8 text-rose-300" />
        <div className="space-y-1 text-center">
          <h1 className="text-base font-semibold text-foreground">
            生成应用详情加载失败
          </h1>
          <p className="text-sm text-muted-foreground">
            应用不存在、无权限访问，或网络请求失败。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => void refetch()}>
            重新加载
          </Button>
          <Link
            to="/generated-apps"
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  const isPublicShareUsable =
    app.publicShareEnabled && isGeneratedAppPublicShareEligible(app.readiness)
  const publicAccessLabel = isPublicShareUsable
    ? '已启用'
    : app.publicShareEnabled
      ? '门禁不可用'
      : '未启用'

  return (
    <div
      className="h-full overflow-auto"
      data-testid="generated-app-detail-page"
    >
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <header className="space-y-4">
          <Link
            to="/generated-apps"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回生成应用列表
          </Link>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
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
              <div className="space-y-2">
                <h1 className="break-words text-2xl font-semibold text-foreground">
                  {app.appName}
                </h1>
                <p className="max-w-4xl break-words text-sm text-muted-foreground">
                  {app.description}
                </p>
              </div>
            </div>
            <dl className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-80">
              <div className="border-l border-border pl-3">
                <dt>更新时间</dt>
                <dd className="font-medium text-foreground">
                  {formatGeneratedAppDateTime(app.updatedAt)}
                </dd>
              </div>
              <div className="border-l border-border pl-3">
                <dt>公开访问</dt>
                <dd className="font-medium text-foreground">
                  {publicAccessLabel}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <DetailSection
          title="Public share"
          description="创建者侧公开链接管理，只在后端 readiness 允许时启用。"
        >
          <GeneratedAppPublicSharePanel app={app} className="max-w-3xl" />
        </DetailSection>

        <DetailSection
          title="提交记录"
          description="创建者侧查看公开应用提交列表、单次详情、运行状态、最终输出、报告和错误状态。"
        >
          <GeneratedAppSubmissionsPanel appId={app.id} />
        </DetailSection>

        <AppSpecSection app={app} />

        <DetailSection
          title="Acceptance scenarios"
          description="Given / When / Then 分组展示，用于约束后续浏览器验收。"
        >
          <AcceptanceScenarioList scenarios={app.appSpec.acceptanceScenarios} />
        </DetailSection>

        <DetailSection
          title="Gate 0-7 结果"
          description="阻断门禁必须全绿且无 warning，才能成为 publish candidate。"
        >
          <GateResultsTable gates={app.gateResults} />
        </DetailSection>

        <DetailSection
          title="Traceability"
          description="核心需求到验收场景和证据的最小追踪矩阵。"
        >
          <TraceabilityTable app={app} />
        </DetailSection>

        <DetailSection
          title="Artifacts"
          description="预览、源码与测试报告仅在 Studio 创建者工作台展示。"
        >
          <dl>
            <ArtifactLink label="Preview URL" url={app.preview.previewUrl} />
            <ArtifactLink
              label="Source artifact"
              url={app.preview.sourceArtifactUrl}
            />
            <ArtifactLink label="Test report" url={app.preview.testReportUrl} />
          </dl>
        </DetailSection>

        <DetailSection
          title="Resource bindings"
          description="底层专业资源仍可在后续切片进入现有编辑器继续精修。"
        >
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <div className="space-y-1 border-l border-border pl-3">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <FileCode2 className="h-4 w-4 text-muted-foreground" />
                Agent
              </dt>
              <dd className="break-all text-muted-foreground">
                {app.agentDefinitionId ?? '尚未绑定'}
              </dd>
            </div>
            <div className="space-y-1 border-l border-border pl-3">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Workflow
              </dt>
              <dd className="break-all text-muted-foreground">
                {app.workflowDefinitionId ?? '尚未绑定'}
              </dd>
            </div>
            <div className="space-y-1 border-l border-border pl-3">
              <dt className="font-medium text-foreground">Plugins</dt>
              <dd>
                <IdList values={app.pluginIds} />
              </dd>
            </div>
          </dl>
        </DetailSection>
      </div>
    </div>
  )
}
