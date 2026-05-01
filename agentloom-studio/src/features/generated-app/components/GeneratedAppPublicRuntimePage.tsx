import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  AppWindow,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
} from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
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
  GeneratedAppPublicWorkflowExecutionHandoff,
  GeneratedAppRuntimeFormField,
  GeneratedAppWorkflowExecutionStatus,
} from '../types'

interface GeneratedAppPublicRuntimePageProps {
  token: string
}

interface PublicSectionProps {
  title: string
  children: ReactNode
}

type PublicFormValue = string | string[]
type PublicFormValues = Record<string, PublicFormValue>
type PublicFormErrors = Record<string, string>

interface RuntimeReportSection {
  id: string
  title: string
  body: string
  items: string[]
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

function buildInitialFormValues(
  fields: GeneratedAppRuntimeFormField[],
): PublicFormValues {
  return Object.fromEntries(
    fields.map((field) => {
      if (field.type === 'multi_select') {
        return [field.id, []]
      }

      if (field.type === 'range') {
        return [field.id, String(field.min ?? 1)]
      }

      return [field.id, '']
    }),
  )
}

function isFieldEmpty(value: PublicFormValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return !value || value.trim().length === 0
}

function buildFormErrors(
  fields: GeneratedAppRuntimeFormField[],
  values: PublicFormValues,
): PublicFormErrors {
  return Object.fromEntries(
    fields
      .filter((field) => field.required && isFieldEmpty(values[field.id]))
      .map((field) => [field.id, `请填写${field.label}。`]),
  )
}

function buildSubmissionInput(
  fields: GeneratedAppRuntimeFormField[],
  values: PublicFormValues,
): Record<string, unknown> {
  const input: Record<string, unknown> = {}

  for (const field of fields) {
    const value = values[field.id]

    if (isFieldEmpty(value)) {
      continue
    }

    if (Array.isArray(value)) {
      input[field.id] = value
      continue
    }

    if (field.type === 'number' || field.type === 'range') {
      const numeric = Number(value)
      input[field.id] = Number.isFinite(numeric) ? numeric : value
      continue
    }

    if (typeof value === 'string') {
      input[field.id] = value.trim()
    }
  }

  return input
}

function getStringProperty(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const raw = value?.[key]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null
}

function getStringArrayProperty(
  value: Record<string, unknown> | null,
  key: string,
): string[] {
  const raw = value?.[key]

  if (!Array.isArray(raw)) {
    return []
  }

  return raw.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  )
}

function getReportSections(
  report: Record<string, unknown> | null,
): RuntimeReportSection[] {
  const rawSections = report?.sections

  if (!Array.isArray(rawSections)) {
    return []
  }

  return rawSections
    .filter(
      (section): section is Record<string, unknown> =>
        section !== null &&
        typeof section === 'object' &&
        !Array.isArray(section),
    )
    .map((section, index) => {
      const items = Array.isArray(section.items)
        ? section.items.filter(
            (item): item is string =>
              typeof item === 'string' && item.trim().length > 0,
          )
        : []

      return {
        id: getStringProperty(section, 'id') ?? `section-${index + 1}`,
        title: getStringProperty(section, 'title') ?? `报告分区 ${index + 1}`,
        body: getStringProperty(section, 'body') ?? '',
        items,
      }
    })
}

function getWorkflowExecutionHandoff(
  submission: GeneratedAppPublicSubmission,
): GeneratedAppPublicWorkflowExecutionHandoff | null {
  const reportHandoff =
    submission.report?.workflowExecution === true ? submission.report : null
  const resultHandoff =
    submission.result?.workflowExecution === true ? submission.result : null

  if (!reportHandoff && !resultHandoff) {
    return null
  }

  return {
    ...resultHandoff,
    ...reportHandoff,
    workflowExecutionSummary:
      reportHandoff?.workflowExecutionSummary ??
      resultHandoff?.workflowExecutionSummary ??
      null,
  }
}

function getWorkflowExecutionStatusLabel(
  status: GeneratedAppWorkflowExecutionStatus | null | undefined,
): string {
  switch (status) {
    case 'pending':
      return '等待执行'
    case 'running':
      return '正在执行'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '执行未完成'
    case 'cancelled':
      return '已取消'
    default:
      return '未创建'
  }
}

function getWorkflowExecutionStateText(
  handoff: GeneratedAppPublicWorkflowExecutionHandoff,
): string {
  switch (handoff.executionStatus) {
    case 'pending':
      return 'Workflow 正在排队，页面会自动刷新执行状态。'
    case 'running':
      return 'Workflow 正在执行，页面会自动刷新执行状态。'
    case 'paused':
      return 'Workflow 已暂停，当前公开页面继续保留本地报告。'
    case 'completed':
      return 'Workflow 执行已完成，当前仅展示安全摘要。'
    case 'failed':
      return 'Workflow 执行未完成，页面继续保留本地报告。'
    case 'cancelled':
      return 'Workflow 已取消，页面继续保留本地报告。'
    default:
      return (
        handoff.workflowExecutionNotice ??
        '未创建 Workflow execution，页面继续保留本地报告。'
      )
  }
}

function WorkflowExecutionStatusPanel({
  handoff,
}: {
  handoff: GeneratedAppPublicWorkflowExecutionHandoff
}) {
  const active =
    handoff.executionStatus === 'pending' ||
    handoff.executionStatus === 'running'
  const completed = handoff.executionStatus === 'completed'
  const incomplete =
    handoff.executionStatus === 'failed' ||
    handoff.executionStatus === 'cancelled'
  const summary = handoff.workflowExecutionSummary

  return (
    <section
      className={cn(
        'space-y-3 border p-4',
        completed
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : incomplete
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-sky-500/30 bg-sky-500/5',
      )}
      data-testid="workflow-execution-status"
      data-execution-status={handoff.executionStatus ?? 'unavailable'}
    >
      <div className="flex items-start gap-3">
        {active ? (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-sky-300" />
        ) : completed ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-sm font-semibold text-foreground">
              Workflow 执行状态
            </h4>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {getWorkflowExecutionStatusLabel(handoff.executionStatus)}
            </span>
          </div>
          <p className="break-words text-sm leading-6 text-muted-foreground">
            {getWorkflowExecutionStateText(handoff)}
          </p>
          {handoff.workflowExecutionNotice ? (
            <p className="break-words text-xs leading-5 text-muted-foreground">
              {handoff.workflowExecutionNotice}
            </p>
          ) : null}
        </div>
      </div>

      {summary ? (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {typeof summary.completedSteps === 'number' ? (
            <span>完成步骤：{summary.completedSteps}</span>
          ) : null}
          {typeof summary.totalSteps === 'number' ? (
            <span>总步骤：{summary.totalSteps}</span>
          ) : null}
          {typeof summary.failedSteps === 'number' ? (
            <span>失败步骤：{summary.failedSteps}</span>
          ) : null}
          {typeof summary.cancelledSteps === 'number' ? (
            <span>取消步骤：{summary.cancelledSteps}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function FieldHelp({
  field,
  error,
}: {
  field: GeneratedAppRuntimeFormField
  error: string | undefined
}) {
  return (
    <div className="space-y-1">
      {field.helpText ? (
        <p className="break-words text-xs leading-5 text-muted-foreground">
          {field.helpText}
        </p>
      ) : null}
      {error ? (
        <p className="break-words text-sm text-rose-300">{error}</p>
      ) : null}
    </div>
  )
}

function RuntimeFormField({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: GeneratedAppRuntimeFormField
  value: PublicFormValue | undefined
  error: string | undefined
  disabled: boolean
  onChange: (fieldId: string, value: PublicFormValue) => void
}) {
  const inputId = `generated-app-public-field-${field.id}`
  const requiredLabel = field.required ? '必填' : '选填'
  const stringValue = Array.isArray(value) ? '' : (value ?? '')
  const selectedValues = Array.isArray(value) ? value : []

  return (
    <div className="min-w-0 space-y-2">
      <label
        htmlFor={inputId}
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground"
      >
        <span>{field.label}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {requiredLabel}
        </span>
      </label>

      {field.type === 'textarea' ? (
        <textarea
          id={inputId}
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="w-full resize-y border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          disabled={disabled}
        />
      ) : null}

      {field.type === 'text' || field.type === 'number' ? (
        <Input
          id={inputId}
          type={field.type === 'number' ? 'number' : 'text'}
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step={field.step}
          disabled={disabled}
        />
      ) : null}

      {field.type === 'range' ? (
        <div className="space-y-2">
          <input
            id={inputId}
            type="range"
            value={stringValue}
            onChange={(event) => onChange(field.id, event.target.value)}
            min={field.min ?? 1}
            max={field.max ?? 10}
            step={field.step ?? 1}
            className="w-full accent-primary"
            disabled={disabled}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{field.min ?? 1}</span>
            <span className="rounded border border-border px-2 py-0.5 text-foreground">
              当前：{stringValue}
            </span>
            <span>{field.max ?? 10}</span>
          </div>
        </div>
      ) : null}

      {field.type === 'single_select' ? (
        <Select
          id={inputId}
          value={stringValue}
          onValueChange={(nextValue) => onChange(field.id, nextValue)}
          disabled={disabled}
        >
          <option value="">请选择</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : null}

      {field.type === 'multi_select' ? (
        <fieldset
          id={inputId}
          className="grid gap-2 sm:grid-cols-2"
          disabled={disabled}
        >
          {field.options.map((option) => {
            const checked = selectedValues.includes(option.value)

            return (
              <label
                key={option.value}
                className="flex min-w-0 items-center gap-2 border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((item) => item !== option.value)
                    onChange(field.id, nextValues)
                  }}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="break-words">{option.label}</span>
              </label>
            )
          })}
        </fieldset>
      ) : null}

      <FieldHelp field={field} error={error} />
    </div>
  )
}

function PublicSubmissionResult({
  app,
  submission,
}: {
  app: GeneratedAppPublicRuntime
  submission: GeneratedAppPublicSubmission
}) {
  const report = submission.report
  const result = submission.result
  const failed = submission.status === 'failed'
  const title = failed
    ? '提交未能生成报告'
    : (getStringProperty(report, 'title') ??
      app.runtimeForm.resultView.successTitle)
  const summary = failed
    ? '提交内容已保存为失败状态，但当前公开运行页无法安全处理该输入结构。请调整输入后重新提交。'
    : (getStringProperty(report, 'summary') ??
      getStringProperty(result, 'summary') ??
      app.runtimeForm.resultView.description)
  const sections = getReportSections(report)
  const nextStepQuestions = [
    ...getStringArrayProperty(report, 'nextStepQuestions'),
    ...getStringArrayProperty(result, 'nextStepQuestions'),
  ].slice(0, 6)
  const followUpPrompts = [
    ...getStringArrayProperty(report, 'followUpPrompts'),
    ...getStringArrayProperty(result, 'followUpPrompts'),
  ].slice(0, 5)
  const disclaimers = getStringArrayProperty(report, 'disclaimers')
  const runtimeNotice =
    getStringProperty(report, 'runtimeNotice') ??
    getStringProperty(result, 'runtimeNotice')
  const workflowExecutionHandoff = getWorkflowExecutionHandoff(submission)

  return (
    <article
      className="space-y-5 border border-border bg-surface-elevated p-4"
      data-testid="generated-app-public-submission-result"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SubmissionStatusBadge status={submission.status} />
            <span className="text-xs text-muted-foreground">
              更新时间 {formatGeneratedAppDateTime(submission.updatedAt)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            {failed ? (
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-rose-300" />
            ) : (
              <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
            )}
            <div className="min-w-0 space-y-2">
              <h3 className="break-words text-lg font-semibold text-foreground">
                {title}
              </h3>
              <p className="break-words text-sm leading-6 text-muted-foreground">
                {summary}
              </p>
            </div>
          </div>
        </div>
      </div>

      {workflowExecutionHandoff ? (
        <WorkflowExecutionStatusPanel handoff={workflowExecutionHandoff} />
      ) : null}

      {submission.errorMessage ? (
        <div className="border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-200">
          {submission.errorMessage}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="grid gap-4">
          {sections.map((section) => (
            <section key={section.id} className="border border-border p-4">
              <h4 className="break-words text-sm font-semibold text-foreground">
                {section.title}
              </h4>
              {section.body ? (
                <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                  {section.body}
                </p>
              ) : null}
              {section.items.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="break-words border-l border-border pl-3"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}

      {nextStepQuestions.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">下一步建议</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {nextStepQuestions.map((question) => (
              <li
                key={question}
                className="break-words border-l border-border pl-3"
              >
                {question}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {followUpPrompts.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">可补充信息</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {followUpPrompts.map((prompt) => (
              <li
                key={prompt}
                className="break-words border-l border-border pl-3"
              >
                {prompt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {disclaimers.length > 0 || runtimeNotice ? (
        <section className="space-y-2 border-t border-border pt-4">
          <h4 className="text-sm font-semibold text-foreground">边界说明</h4>
          {runtimeNotice ? (
            <p className="break-words text-sm leading-6 text-muted-foreground">
              {runtimeNotice}
            </p>
          ) : null}
          {disclaimers.length > 0 ? (
            <ul className="space-y-2 text-sm text-muted-foreground">
              {disclaimers.map((disclaimer) => (
                <li
                  key={disclaimer}
                  className="break-words border-l border-border pl-3"
                >
                  {disclaimer}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
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
  const [formValues, setFormValues] = useState<PublicFormValues>(() =>
    buildInitialFormValues(app.runtimeForm.fields),
  )
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<PublicFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const createSubmissionMutation = useCreateGeneratedAppPublicSubmission(token)
  const submissionQuery = useGeneratedAppPublicSubmission(
    token,
    submissionId ?? undefined,
  )
  const visibleSubmission =
    submissionQuery.data ?? createSubmissionMutation.data ?? null
  const fieldsById = useMemo(
    () => new Map(app.runtimeForm.fields.map((field) => [field.id, field])),
    [app.runtimeForm.fields],
  )

  const handleFieldChange = useCallback(
    (fieldId: string, nextValue: PublicFormValue) => {
      setFormValues((current) => ({ ...current, [fieldId]: nextValue }))
      setFormErrors((current) => {
        if (!current[fieldId]) {
          return current
        }

        const nextErrors = { ...current }
        delete nextErrors[fieldId]
        return nextErrors
      })
    },
    [],
  )

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextErrors = buildFormErrors(app.runtimeForm.fields, formValues)

      if (Object.keys(nextErrors).length > 0) {
        setFormErrors(nextErrors)
        setFormError('请先补齐必填字段。')
        return
      }

      setFormError(null)

      try {
        const submission = await createSubmissionMutation.mutateAsync({
          input: buildSubmissionInput(app.runtimeForm.fields, formValues),
          clientContext: {
            submittedAt: new Date().toISOString(),
            formId: app.runtimeForm.formId,
          },
        })
        setSubmissionId(submission.id)
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : '提交失败，请稍后重试。',
        )
      }
    },
    [app.runtimeForm, createSubmissionMutation, formValues],
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

        <PublicSection title="业务表单">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <form className="min-w-0 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <h3 className="break-words text-lg font-semibold text-foreground">
                  {app.runtimeForm.title}
                </h3>
                <p className="break-words text-sm leading-6 text-muted-foreground">
                  {app.runtimeForm.description}
                </p>
              </div>

              {app.runtimeForm.sections.map((section) => (
                <section
                  key={section.id}
                  className="space-y-4 border border-border p-4"
                >
                  <div className="space-y-1">
                    <h4 className="break-words text-sm font-semibold text-foreground">
                      {section.title}
                    </h4>
                    <p className="break-words text-xs leading-5 text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  <div className="grid gap-4">
                    {section.fieldIds
                      .map((fieldId) => fieldsById.get(fieldId))
                      .filter((field): field is GeneratedAppRuntimeFormField =>
                        Boolean(field),
                      )
                      .map((field) => (
                        <RuntimeFormField
                          key={field.id}
                          field={field}
                          value={formValues[field.id]}
                          error={formErrors[field.id]}
                          disabled={createSubmissionMutation.isPending}
                          onChange={handleFieldChange}
                        />
                      ))}
                  </div>
                </section>
              ))}

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
                {app.runtimeForm.submitLabel}
              </Button>
            </form>

            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="break-words text-sm font-medium text-foreground">
                    {app.runtimeForm.resultView.title}
                  </h3>
                  <p className="break-words text-xs leading-5 text-muted-foreground">
                    {app.runtimeForm.resultView.description}
                  </p>
                </div>
                {submissionQuery.isFetching ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在刷新
                  </span>
                ) : null}
              </div>

              {visibleSubmission ? (
                <PublicSubmissionResult
                  app={app}
                  submission={visibleSubmission}
                />
              ) : (
                <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {app.runtimeForm.resultView.emptyState}
                </div>
              )}
            </div>
          </div>
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

        <PublicSection title="运行预览">
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

  return <PublicRuntimeSuccess app={data} token={token} />
}
