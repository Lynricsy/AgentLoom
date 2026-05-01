import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  PencilLine,
  Loader2,
  ListChecks,
  ShieldAlert,
  WandSparkles,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { useToast } from '@/shared/ui/toast'
import {
  useGeneratedApp,
  useGeneratedAppArtifactContent,
  useGeneratedAppArtifactManifest,
  useGeneratedAppRuntimeBindingReadiness,
  useStartGeneratedAppGenerationRun,
} from '../api'
import { GeneratedAppGenerationEvidencePanel } from './GeneratedAppGenerationEvidencePanel'
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
  GeneratedAppArtifactManifest,
  GeneratedAppArtifactSummary,
  GeneratedAppGateResult,
  GeneratedAppRuntimeBindingReadiness,
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

const ARTIFACT_KIND_LABELS = {
  workspace_source_file: '源码',
  workspace_test_file: '测试',
  source_manifest: '源码清单',
  source_artifact_manifest: '源码交付',
  build_output: '构建产物',
  build_manifest: '构建清单',
  unit_test_report: '单测报告',
  typecheck_report: '类型检查',
  component_golden_report: '组件/Golden',
  coverage_summary: '覆盖率',
} as const satisfies Record<GeneratedAppArtifactSummary['kind'], string>

function formatArtifactSize(sizeBytes: number | null) {
  if (sizeBytes === null) {
    return '未物化'
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

function GeneratedAppArtifactDeliveryPanel({ appId }: { appId: string }) {
  const manifestQuery = useGeneratedAppArtifactManifest(appId)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(
    null,
  )
  const buildPreviewArtifact =
    manifestQuery.data?.artifacts.find(
      (artifact) => artifact.artifactId === 'gate-3-build-output-html',
    ) ?? null
  const selectedArtifact =
    manifestQuery.data?.artifacts.find(
      (artifact) => artifact.artifactId === selectedArtifactId,
    ) ?? null
  const buildPreviewQuery = useGeneratedAppArtifactContent(
    appId,
    buildPreviewArtifact?.readable ? buildPreviewArtifact.artifactId : undefined,
  )
  const contentQuery = useGeneratedAppArtifactContent(
    appId,
    selectedArtifact?.readable ? selectedArtifact.artifactId : undefined,
  )

  if (manifestQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在读取受控 workspace 交付物
      </div>
    )
  }

  if (manifestQuery.isError) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            交付物清单暂时无法读取。
          </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void manifestQuery.refetch()
          }}
        >
          重新读取
        </Button>
      </div>
    )
  }

  const manifest = manifestQuery.data

  if (!manifest?.workspace || manifest.artifacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Gate 3 还没有生成可查看的受控 workspace 交付物。
      </p>
    )
  }

  return (
    <div className="space-y-4" data-testid="generated-app-artifact-delivery">
      <ArtifactWorkspaceSummary manifest={manifest} />
      <GeneratedAppBuildPreview
        artifact={buildPreviewArtifact}
        isLoading={buildPreviewQuery.isLoading}
        isError={buildPreviewQuery.isError}
        html={buildPreviewQuery.data?.content}
        onRetry={() => {
          void buildPreviewQuery.refetch()
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-h-0 overflow-hidden rounded-md border border-border">
          <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            交付文件
          </div>
          <div className="max-h-96 overflow-auto">
            {manifest.artifacts.map((artifact) => (
              <button
                key={artifact.artifactId}
                type="button"
                disabled={!artifact.readable}
                onClick={() => setSelectedArtifactId(artifact.artifactId)}
                className={cn(
                  'flex w-full min-w-0 items-start justify-between gap-3 border-b border-border px-3 py-3 text-left last:border-b-0',
                  selectedArtifactId === artifact.artifactId
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/40',
                  !artifact.readable && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="min-w-0 space-y-1">
                  <span className="block break-words text-sm font-medium text-foreground">
                    {artifact.label}
                  </span>
                  <span className="block break-all text-xs text-muted-foreground">
                    {artifact.path}
                  </span>
                </span>
                <span className="shrink-0 space-y-1 text-right">
                  <span className="block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {ARTIFACT_KIND_LABELS[artifact.kind]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatArtifactSize(artifact.sizeBytes)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <ArtifactContentPreview
          artifact={selectedArtifact}
          isLoading={contentQuery.isLoading}
          isError={contentQuery.isError}
          content={contentQuery.data?.content}
          onRetry={() => {
            void contentQuery.refetch()
          }}
        />
      </div>
    </div>
  )
}

function GeneratedAppBuildPreview({
  artifact,
  isLoading,
  isError,
  html,
  onRetry,
}: {
  artifact: GeneratedAppArtifactSummary | null
  isLoading: boolean
  isError: boolean
  html: string | undefined
  onRetry: () => void
}) {
  if (!artifact) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Gate 3 还没有生成可预览的构建产物。
      </div>
    )
  }

  if (!artifact.readable) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        构建产物尚未物化，或超过内联预览限制。
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-md border border-border p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在读取构建预览
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
        <span>构建预览读取失败。</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-md border border-border"
      data-testid="generated-app-build-preview"
    >
      <div className="flex flex-col gap-1 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-foreground">
            Gate 3 构建预览
          </h3>
          <p className="break-all text-xs text-muted-foreground">
            {artifact.path}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatArtifactSize(artifact.sizeBytes)}
        </span>
      </div>
      <iframe
        title="Generated App Gate 3 构建预览"
        sandbox=""
        srcDoc={html ?? ''}
        className="h-80 w-full bg-background"
      />
    </div>
  )
}

function ArtifactWorkspaceSummary({
  manifest,
}: {
  manifest: GeneratedAppArtifactManifest
}) {
  const workspace = manifest.workspace

  if (!workspace) {
    return null
  }

  return (
    <dl className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground md:grid-cols-3">
      <div className="min-w-0">
        <dt>Workspace</dt>
        <dd className="break-all font-medium text-foreground">
          {workspace.rootLabel}/{workspace.relativePath}
        </dd>
      </div>
      <div>
        <dt>Scaffold</dt>
        <dd className="font-medium text-foreground">{workspace.scaffold}</dd>
      </div>
      <div>
        <dt>Gate 3 执行层级</dt>
        <dd className="font-medium text-foreground">
          {workspace.executionLevel ?? '未生成'}
        </dd>
      </div>
    </dl>
  )
}

function ArtifactContentPreview({
  artifact,
  isLoading,
  isError,
  content,
  onRetry,
}: {
  artifact: GeneratedAppArtifactSummary | null
  isLoading: boolean
  isError: boolean
  content: string | undefined
  onRetry: () => void
}) {
  if (!artifact) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        选择一个已物化且可读的源码或测试产物查看内容。
      </div>
    )
  }

  if (!artifact.readable) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        该交付物尚未物化，或大小超过内联查看限制。
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-md border border-border p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        正在读取 {artifact.label}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
        <span>交付物内容读取失败。</span>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex flex-col gap-1 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-medium text-foreground">
            {artifact.label}
          </h3>
          <p className="break-all text-xs text-muted-foreground">
            {artifact.path}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatArtifactSize(artifact.sizeBytes)}
        </span>
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-background p-3 text-xs leading-5 text-muted-foreground">
        {content ?? ''}
      </pre>
    </div>
  )
}

function ProfessionalEditorLink({
  label,
  resourceId,
  to,
  params,
}: {
  label: string
  resourceId: string | null
  to: '/agents/$agentId' | '/workflows/$workflowId'
  params: { agentId: string } | { workflowId: string }
}) {
  if (!resourceId) {
    return <span className="text-muted-foreground">尚未绑定</span>
  }

  return (
    <div className="space-y-2">
      <code className="block break-all rounded bg-muted px-1.5 py-1 text-xs text-muted-foreground">
        {resourceId}
      </code>
      <Link
        to={to}
        params={params}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        <PencilLine className="h-3.5 w-3.5" />
        {label}
      </Link>
    </div>
  )
}

const RUNTIME_BINDING_READINESS_LABELS = {
  deterministic_only: 'Deterministic only',
  editor_handoff_draft: '编辑器草稿',
  workflow_not_found: 'Workflow 不可用',
  workflow_not_published: '尚未发布',
  workflow_published: '可启动 Workflow',
} as const satisfies Record<
  GeneratedAppRuntimeBindingReadiness['state'],
  string
>

function RuntimeBindingReadinessPanel({
  readiness,
  isLoading,
  isError,
  onRetry,
}: {
  readiness: GeneratedAppRuntimeBindingReadiness | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在检查绑定 Workflow 的运行状态
      </div>
    )
  }

  if (isError || !readiness) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
          运行绑定状态暂时无法读取。
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          重新检查
        </Button>
      </div>
    )
  }

  const canStart = readiness.canStartWorkflowExecution

  return (
    <div className="space-y-4" data-testid="runtime-binding-readiness">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                canStart
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-200',
              )}
            >
              {canStart ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              {RUNTIME_BINDING_READINESS_LABELS[readiness.state]}
            </span>
            <span className="text-xs text-muted-foreground">
              {canStart ? '公开提交可创建异步执行' : '公开提交不会启动 Workflow'}
            </span>
          </div>
          <p className="break-words text-sm font-medium text-foreground">
            {readiness.summary}
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {readiness.notice}
          </p>
        </div>
        <dl className="grid shrink-0 gap-2 text-xs text-muted-foreground sm:min-w-48">
          <div>
            <dt>Workflow 状态</dt>
            <dd className="font-medium text-foreground">
              {readiness.workflowStatus ?? '未绑定'}
            </dd>
          </div>
          <div>
            <dt>检查时间</dt>
            <dd className="font-medium text-foreground">
              {formatGeneratedAppDateTime(readiness.updatedAt)}
            </dd>
          </div>
        </dl>
      </div>
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
  const { notify } = useToast()
  const { data: app, isError, isLoading, refetch } = useGeneratedApp(appId)
  const runtimeBindingReadinessQuery =
    useGeneratedAppRuntimeBindingReadiness(appId)
  const startGenerationRunMutation = useStartGeneratedAppGenerationRun(appId)

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
  const runActionLabel =
    app.gateResults.length > 0 ? '重新运行自动生成与验证' : '运行自动生成与验证'

  const handleStartGenerationRun = async () => {
    try {
      const result = await startGenerationRunMutation.mutateAsync({
        triggerSource: app.gateResults.length > 0 ? 'retry' : 'manual',
      })
      notify({
        title: '自动生成与验证已完成',
        description:
          result.generationRun.status === 'passed'
            ? '应用已进入当前自动生成结果，可继续查看证据或启用公开分享。'
            : result.generationRun.failureReason ||
              result.generationRun.summary,
        variant:
          result.generationRun.status === 'passed' ? 'success' : 'warning',
      })
      void refetch()
    } catch (error) {
      notify({
        title: '自动生成启动失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'error',
      })
    }
  }

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
          title="自动生成与验证"
          description="从当前 AppSpec 启动受控生成、测试和发布候选检查；公开分享仍需在 readiness 允许后显式启用。"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
              <p className="break-words">{app.readiness.summary}</p>
              <p>
                当前阻断项 {app.readiness.blockingIssueCount} 个，Warning{' '}
                {app.readiness.warningCount} 个。
              </p>
            </div>
            <Button
              onClick={() => void handleStartGenerationRun()}
              disabled={startGenerationRunMutation.isPending}
              className="shrink-0"
            >
              {startGenerationRunMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <WandSparkles className="mr-2 h-4 w-4" />
              )}
              {startGenerationRunMutation.isPending
                ? '正在运行'
                : runActionLabel}
            </Button>
          </div>
        </DetailSection>

        <DetailSection
          title="Public share"
          description="创建者侧公开链接管理，只在后端 readiness 允许时启用。"
        >
          <GeneratedAppPublicSharePanel app={app} className="max-w-3xl" />
        </DetailSection>

        <DetailSection
          title="Runtime binding readiness"
          description="创建者侧检查公开提交是否会启动绑定 Workflow；不改变 public-share readiness gate。"
        >
          <RuntimeBindingReadinessPanel
            readiness={runtimeBindingReadinessQuery.data}
            isLoading={runtimeBindingReadinessQuery.isLoading}
            isError={runtimeBindingReadinessQuery.isError}
            onRetry={() => void runtimeBindingReadinessQuery.refetch()}
          />
        </DetailSection>

        <DetailSection
          title="提交记录"
          description="创建者侧查看公开应用提交列表、单次详情、运行状态、最终输出、报告和错误状态。"
        >
          <GeneratedAppSubmissionsPanel appId={app.id} />
        </DetailSection>

        <DetailSection
          title="生成证据/运行记录"
          description="创建者侧查看 generation runs、repair attempts 与 Gate run 证据摘要。"
        >
          <GeneratedAppGenerationEvidencePanel appId={app.id} />
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
          description="预览 URL、受控 workspace 源码与测试报告仅在 Studio 创建者工作台展示。"
        >
          <div className="space-y-5">
            <dl>
              <ArtifactLink label="Preview URL" url={app.preview.previewUrl} />
              <ArtifactLink
                label="Source artifact URL"
                url={app.preview.sourceArtifactUrl}
              />
              <ArtifactLink
                label="Test report URL"
                url={app.preview.testReportUrl}
              />
            </dl>
            <GeneratedAppArtifactDeliveryPanel appId={app.id} />
          </div>
        </DetailSection>

        <DetailSection
          title="Resource bindings"
          description="创建者侧专业资源入口；公开 runtime 不展示这些内部资源。"
        >
          <dl className="grid gap-4 text-sm md:grid-cols-3">
            <div className="space-y-1 border-l border-border pl-3">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <FileCode2 className="h-4 w-4 text-muted-foreground" />
                Agent
              </dt>
              <dd>
                <ProfessionalEditorLink
                  label="打开 Agent 专业编辑器"
                  resourceId={app.agentDefinitionId}
                  to="/agents/$agentId"
                  params={{ agentId: app.agentDefinitionId ?? '' }}
                />
              </dd>
            </div>
            <div className="space-y-1 border-l border-border pl-3">
              <dt className="flex items-center gap-2 font-medium text-foreground">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Workflow
              </dt>
              <dd>
                <ProfessionalEditorLink
                  label="打开 Workflow 专业编辑器"
                  resourceId={app.workflowDefinitionId}
                  to="/workflows/$workflowId"
                  params={{ workflowId: app.workflowDefinitionId ?? '' }}
                />
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
