import { useCallback, useState, type ReactNode } from 'react'
import { HTTPError } from 'ky'
import {
  AlertTriangle,
  AppWindow,
  ExternalLink,
  Inbox,
  Send,
  ShieldCheck,
} from 'lucide-react'

import { resolveProblemDetail } from '@/shared/api/problemDetail'
import { EmptyState } from '@/shared/components/empty-state/EmptyState'
import { MarkdownRenderer } from '@/shared/components/markdown/MarkdownRenderer'
import { PageHeader } from '@/shared/components/page-header/PageHeader'
import { Spinner } from '@/shared/components/spinner/Spinner'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import { StatusBadge } from '@/shared/ui/status-badge'
import { Textarea } from '@/shared/ui/textarea'
import {
  useCreateGeneratedAppPublicSubmission,
  useGeneratedAppPublicRuntime,
  useGeneratedAppPublicSubmission,
} from '../api'
import {
  GENERATED_APP_SUBMISSION_STATUS_META,
  formatGeneratedAppDateTime,
} from '../lib/generatedAppDisplay'
import type {
  GeneratedAppField,
  GeneratedAppPublicRuntime,
  GeneratedAppPublicSubmission,
  GeneratedAppRuntimeResult,
  GeneratedAppRuntimeResultSection,
} from '../types'

/*
 * 公开页 DOM 约定（Gate 5 browser-runner 按它定位，改动前同步
 * agentloom-server/src/modules/generated-app-browser-runner）：
 * - 字段控件带 data-field-id；单选/多选的容器带 data-field-id，选项带 data-option-value
 * - 提交是表单内唯一的 button[type=submit]
 * - 结果容器带 data-result-status（running/completed/failed）与 data-submission-id
 * - 每个结果分区的取值容器带 data-result-section-id，只包含分区内容本身
 */

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
      className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground"
      data-testid="generated-app-public-runtime-loading"
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner size="lg" />
        正在打开应用…
      </div>
    </main>
  )
}

function PublicRuntimeError({ onRetry }: { onRetry: () => void }) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground"
      data-testid="generated-app-public-runtime-error"
    >
      <section className="w-full max-w-xl rounded-lg border border-error/30 bg-error/10 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
          <div className="min-w-0 space-y-4">
            <div className="space-y-2">
              <h2 className="break-words text-lg font-semibold text-foreground">
                公开应用不可访问或已关闭
              </h2>
              <p className="break-words text-sm text-muted-foreground">
                这个链接不存在、已被创建者关闭，或应用当前不满足公开访问条件。
              </p>
            </div>
            <Button variant="outline" onClick={onRetry}>
              重新加载
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

function isFieldEmpty(value: PublicFormValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return !value || value.trim().length === 0
}

/** 前端只拦截必填与非数字，长度、范围与选项由 maxLength/min/max 属性和服务端严格校验兜底 */
function buildFormErrors(
  fields: GeneratedAppField[],
  values: PublicFormValues,
): PublicFormErrors {
  const errors: PublicFormErrors = {}

  for (const field of fields) {
    const value = values[field.id]

    if (isFieldEmpty(value)) {
      if (field.required) {
        errors[field.id] = `请填写${field.label}。`
      }
      continue
    }

    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      errors[field.id] = `${field.label}需要填写数字。`
    }
  }

  return errors
}

/** 按字段类型组装提交 JSON：空值不提交，number 转为数值，文本去掉首尾空白 */
function buildSubmissionInput(
  fields: GeneratedAppField[],
  values: PublicFormValues,
): Record<string, unknown> {
  const input: Record<string, unknown> = {}

  for (const field of fields) {
    const value = values[field.id]

    if (value === undefined || isFieldEmpty(value)) {
      continue
    }

    if (Array.isArray(value)) {
      input[field.id] = value
    } else if (field.type === 'number') {
      input[field.id] = Number(value)
    } else {
      input[field.id] = value.trim()
    }
  }

  return input
}

/** 服务端 422 `generated-app-public-submission-invalid` 的 errors[]（field 形如 `input.<字段 id>`）标到对应字段上 */
function readProblemFieldErrors(
  error: unknown,
  fields: GeneratedAppField[],
): PublicFormErrors {
  const problem: unknown = error instanceof HTTPError ? error.data : null
  const items =
    problem && typeof problem === 'object' && 'errors' in problem
      ? problem.errors
      : null
  const errors: PublicFormErrors = {}

  if (!Array.isArray(items)) {
    return errors
  }

  for (const item of items) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.field !== 'string' ||
      typeof item.message !== 'string'
    ) {
      continue
    }

    const fieldId = item.field.replace(/^input\./, '')
    if (fields.some((field) => field.id === fieldId)) {
      errors[fieldId] = item.message
    }
  }

  return errors
}

/** 结果状态以服务端 result.status 为准；尚未写入 result 时按提交状态推断 */
function getResultStatus(
  submission: GeneratedAppPublicSubmission,
): GeneratedAppRuntimeResult['status'] {
  if (submission.result) {
    return submission.result.status
  }

  if (submission.status === 'completed' || submission.status === 'failed') {
    return submission.status
  }

  return 'running'
}

function FieldHelp({
  field,
  error,
}: {
  field: GeneratedAppField
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
        <p className="break-words text-sm text-error">{error}</p>
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
  field: GeneratedAppField
  value: PublicFormValue | undefined
  error: string | undefined
  disabled: boolean
  onChange: (fieldId: string, value: PublicFormValue) => void
}) {
  const inputId = `generated-app-public-field-${field.id}`
  const labelId = `${inputId}-label`
  const stringValue = Array.isArray(value) ? '' : (value ?? '')
  const selectedValues = Array.isArray(value) ? value : []

  return (
    <div className="min-w-0 space-y-2">
      <label
        id={labelId}
        htmlFor={inputId}
        className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground"
      >
        <span>{field.label}</span>
        <Badge variant="outline" size="sm">
          {field.required ? '必填' : '选填'}
        </Badge>
      </label>

      {field.type === 'textarea' ? (
        <Textarea
          id={inputId}
          data-field-id={field.id}
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          rows={4}
          disabled={disabled}
        />
      ) : null}

      {field.type === 'text' ? (
        <Input
          id={inputId}
          data-field-id={field.id}
          type="text"
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          disabled={disabled}
        />
      ) : null}

      {field.type === 'number' ? (
        <Input
          id={inputId}
          data-field-id={field.id}
          type="number"
          inputMode="decimal"
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          step="any"
          disabled={disabled}
        />
      ) : null}

      {field.type === 'single_select' ? (
        <RadioGroup
          id={inputId}
          data-field-id={field.id}
          aria-labelledby={labelId}
          value={stringValue}
          onValueChange={(nextValue) => onChange(field.id, nextValue)}
          className="sm:grid-cols-2"
          disabled={disabled}
        >
          {field.options.map((option) => (
            <div
              key={option.value}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <RadioGroupItem
                id={`${inputId}-${option.value}`}
                value={option.value}
                data-option-value={option.value}
              />
              <label
                htmlFor={`${inputId}-${option.value}`}
                className="min-w-0 break-words"
              >
                {option.label}
              </label>
            </div>
          ))}
        </RadioGroup>
      ) : null}

      {field.type === 'multi_select' ? (
        <fieldset
          id={inputId}
          data-field-id={field.id}
          aria-labelledby={labelId}
          className="grid gap-2 sm:grid-cols-2"
          disabled={disabled}
        >
          {field.options.map((option) => (
            <div
              key={option.value}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <Checkbox
                id={`${inputId}-${option.value}`}
                data-option-value={option.value}
                checked={selectedValues.includes(option.value)}
                onCheckedChange={(next) => {
                  onChange(
                    field.id,
                    next === true
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((item) => item !== option.value),
                  )
                }}
              />
              <label
                htmlFor={`${inputId}-${option.value}`}
                className="min-w-0 break-words"
              >
                {option.label}
              </label>
            </div>
          ))}
        </fieldset>
      ) : null}

      <FieldHelp field={field} error={error} />
    </div>
  )
}

function ResultSectionContent({
  section,
}: {
  section: GeneratedAppRuntimeResultSection
}) {
  switch (section.format) {
    case 'text':
      return section.value ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {section.value}
        </p>
      ) : null
    case 'markdown':
      return section.value ? (
        <MarkdownRenderer content={section.value} className="text-sm" />
      ) : null
    case 'citations':
      return section.value && section.value.length > 0 ? (
        <ol className="space-y-3">
          {section.value.map((citation, index) => (
            <li
              key={index}
              className="min-w-0 space-y-1 border-l-2 border-border pl-3 text-sm"
            >
              {citation.title ? (
                <p className="break-words font-medium text-foreground">
                  {citation.title}
                </p>
              ) : null}
              {citation.quote ? (
                <blockquote className="whitespace-pre-wrap break-words leading-6 text-muted-foreground">
                  {citation.quote}
                </blockquote>
              ) : null}
              {citation.source ? (
                <p className="break-all text-xs text-muted-foreground">
                  {citation.source}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null
    case 'json':
      return section.value === null || section.value === undefined ? null : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs text-foreground">
          {JSON.stringify(section.value, null, 2)}
        </pre>
      )
  }
}

function PublicSubmissionResult({
  submission,
}: {
  submission: GeneratedAppPublicSubmission
}) {
  const status = getResultStatus(submission)
  const sections = submission.result?.sections ?? []
  const publicError =
    submission.result?.publicError ?? submission.errorMessage ?? null
  const statusMeta = GENERATED_APP_SUBMISSION_STATUS_META[submission.status]

  return (
    <article
      className="space-y-4 rounded-lg border border-border bg-muted p-4"
      data-testid="generated-app-public-submission-result"
      data-result-status={status}
      data-submission-id={submission.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
        <span className="text-xs text-muted-foreground">
          更新时间 {formatGeneratedAppDateTime(submission.updatedAt)}
        </span>
      </div>

      {status === 'running' ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          正在处理，结果出来后会自动显示。
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
          <p className="break-words text-sm text-error">
            {publicError ?? '提交没有完成，请稍后重新提交。'}
          </p>
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="grid gap-4">
          {sections.map((section) => (
            <section
              key={section.sectionId}
              className="min-w-0 space-y-2 rounded-lg border border-border bg-surface p-4"
            >
              <h4 className="break-words text-sm font-semibold text-foreground">
                {section.label}
              </h4>
              <div data-result-section-id={section.sectionId}>
                <ResultSectionContent section={section} />
              </div>
              {section.value === null ||
              section.value === undefined ||
              (Array.isArray(section.value) && section.value.length === 0) ? (
                <p className="text-sm text-muted-foreground">没有返回内容。</p>
              ) : null}
            </section>
          ))}
        </div>
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
  const { fields, resultView } = app.runtimeForm
  const previewUrl = app.runtimeSurface.previewUrl
  const [formValues, setFormValues] = useState<PublicFormValues>(() =>
    Object.fromEntries(
      fields.map((field) => [field.id, field.type === 'multi_select' ? [] : '']),
    ),
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
      const nextErrors = buildFormErrors(fields, formValues)

      if (Object.keys(nextErrors).length > 0) {
        setFormErrors(nextErrors)
        setFormError('请先修正标出的字段。')
        return
      }

      setFormError(null)

      try {
        const submission = await createSubmissionMutation.mutateAsync({
          input: buildSubmissionInput(fields, formValues),
          clientContext: {
            submittedAt: new Date().toISOString(),
            formId: app.runtimeForm.formId,
          },
        })
        setSubmissionId(submission.id)
      } catch (error) {
        setFormErrors(readProblemFieldErrors(error, fields))
        setFormError(resolveProblemDetail(error, '提交失败，请稍后重试。'))
      }
    },
    [app.runtimeForm.formId, createSubmissionMutation, fields, formValues],
  )

  return (
    <main
      className="min-h-dvh bg-background text-foreground"
      data-testid="generated-app-public-runtime-page"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-5 pb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AppWindow className="size-4 shrink-0" />
            <span className="truncate">公开应用</span>
          </div>
          <PageHeader title={app.title} description={app.description} />
        </div>

        <section className="border-y border-border bg-muted px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
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
            <form className="min-w-0 space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <h3 className="break-words text-lg font-semibold text-foreground">
                  {app.runtimeForm.title}
                </h3>
                {app.runtimeForm.description ? (
                  <p className="break-words text-sm leading-6 text-muted-foreground">
                    {app.runtimeForm.description}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 rounded-lg border border-border p-4">
                {fields.map((field) => (
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

              {formError ? (
                <p className="break-words text-sm text-error">{formError}</p>
              ) : null}
              <Button
                type="submit"
                disabled={createSubmissionMutation.isPending}
              >
                {createSubmissionMutation.isPending ? <Spinner /> : <Send />}
                {app.runtimeForm.submitLabel}
              </Button>
            </form>

            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 break-words text-sm font-medium text-foreground">
                  {resultView.title}
                </h3>
                {submissionQuery.isFetching ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Spinner size="sm" />
                    正在刷新
                  </span>
                ) : null}
              </div>

              {visibleSubmission ? (
                <PublicSubmissionResult submission={visibleSubmission} />
              ) : (
                <EmptyState icon={Inbox} title={resultView.emptyState} />
              )}
            </div>
          </div>
        </PublicSection>

        <PublicSection title="页面和流程">
          <ol className="divide-y divide-border">
            {app.appSpec.pages.map((page) => (
              <li key={page.id} className="py-4 first:pt-0 last:pb-0">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
                  <h3 className="min-w-0 break-words text-sm font-medium text-foreground">
                    {page.name}
                  </h3>
                  <p className="min-w-0 break-words text-sm leading-6 text-muted-foreground">
                    {page.purpose}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </PublicSection>

        <PublicSection title="运行预览">
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants(), 'max-w-full')}
            >
              <span className="truncate">打开运行预览</span>
              <ExternalLink className="shrink-0" />
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
