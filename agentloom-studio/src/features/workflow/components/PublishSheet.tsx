import { memo, useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { RadioGroup, RadioGroupItem } from '@/shared/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet'
import { Textarea } from '@/shared/ui/textarea'
import { usePublishWorkflow } from '../api/versionMutations'
import { useWorkflowVersions } from '../api/versionQueries'
import { useToast } from '@/shared/ui/toast'
import type { PublishWarning, WorkflowVersion } from '../types'

interface PublishSheetProps {
  open: boolean
  workflowId: string
  initialVersionId?: string | null
  onOpenChange: (open: boolean) => void
}

interface PublishErrorPayload {
  detail?: unknown
  errors?: Array<{
    message?: unknown
  }>
}

type VersionSource = 'current' | 'existing'

const VERSION_SOURCE_OPTIONS: Array<{
  value: VersionSource
  id: string
  testId: string
  title: string
  description: string
}> = [
  {
    value: 'current',
    id: 'publish-source-current',
    testId: 'source-current',
    title: '当前编辑稿',
    description: '将当前画布状态创建为新的发布版本',
  },
  {
    value: 'existing',
    id: 'publish-source-existing',
    testId: 'source-existing',
    title: '选择已有记录',
    description: '从已保存快照或历史发布中选择一条记录进行发布',
  },
]

async function extractPublishErrorMessages(error: unknown): Promise<string[]> {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: unknown }).response
    if (typeof Response !== 'undefined' && response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as PublishErrorPayload
        const messages = (payload.errors ?? [])
          .map((item) => (typeof item.message === 'string' ? item.message.trim() : ''))
          .filter(Boolean)

        if (messages.length > 0) {
          return messages
        }

        if (typeof payload.detail === 'string' && payload.detail.trim()) {
          return [payload.detail.trim()]
        }
      } catch {
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return [error.message.trim()]
  }

  return ['发布失败，请稍后重试']
}

function formatPublishableRecordLabel(version: WorkflowVersion): string {
  if (typeof version.releaseNumber === 'number') {
    return `版本 v${String(version.releaseNumber)}${version.label ? ` - ${version.label}` : ''}`
  }

  return `快照 #${String(version.versionNumber)}${version.label ? ` - ${version.label}` : ''}`
}

export const PublishSheet = memo(function PublishSheet({
  open,
  workflowId,
  initialVersionId,
  onOpenChange,
}: PublishSheetProps) {
  const [label, setLabel] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [versionSource, setVersionSource] = useState<VersionSource>('current')
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [publishWarnings, setPublishWarnings] = useState<PublishWarning[] | null>(null)
  const [expandedWarnings, setExpandedWarnings] = useState<Set<number>>(new Set())

  const publishMutation = usePublishWorkflow(workflowId)
  const { data: versionsData } = useWorkflowVersions(workflowId, { page: 1, pageSize: 50 })
  const { notify } = useToast()

  const unpublishedVersions = (versionsData?.data ?? []).filter(
    (v) => !v.publishedAt && !v.archivedAt,
  )

  const resetForm = useCallback((nextVersionId: string | null = initialVersionId ?? null) => {
    setLabel('')
    setReleaseNotes('')
    setVersionSource(nextVersionId ? 'existing' : 'current')
    setSelectedVersionId(nextVersionId ?? '')
    setValidationErrors([])
    setPublishWarnings(null)
    setExpandedWarnings(new Set())
  }, [initialVersionId])

  useEffect(() => {
    if (open) {
      resetForm(initialVersionId ?? null)
    }
  }, [initialVersionId, open, resetForm])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setValidationErrors([])

      if (versionSource === 'existing' && !selectedVersionId) {
        setValidationErrors(['请选择一条可发布记录'])
        return
      }

      try {
        const response = await publishMutation.mutateAsync({
          label: label.trim() || undefined,
          releaseNotes: releaseNotes.trim() || undefined,
          versionId: versionSource === 'existing' ? selectedVersionId : undefined,
        })
        const warnings = response.warnings ?? []
        if (warnings.length > 0) {
          notify({
            title: '发布成功',
            description: `工作流已发布，并返回 ${String(warnings.length)} 条兼容性警告`,
            variant: 'success',
          })
          setPublishWarnings(warnings)
        } else {
          notify({
            title: '发布成功',
            description: '工作流已发布',
            variant: 'success',
          })
          resetForm()
          onOpenChange(false)
        }
      } catch (err) {
        setValidationErrors(await extractPublishErrorMessages(err))
      }
    },
    [
      label,
      releaseNotes,
      versionSource,
      selectedVersionId,
      publishMutation,
      notify,
      onOpenChange,
      resetForm,
    ],
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resetForm()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetForm],
  )

  const toggleWarning = useCallback((index: number) => {
    setExpandedWarnings((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" hideClose data-testid="publish-sheet">
        <SheetHeader className="pr-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle>发布工作流</SheetTitle>
              <SheetDescription className="mt-0.5 text-xs">
                发布后工作流将可被执行引擎调用
              </SheetDescription>
            </div>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="关闭"
                data-testid="close-publish-sheet"
              >
                <X className="h-4 w-4" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        {publishWarnings ? (
          <>
            <SheetBody className="space-y-4">
              <div className="flex items-start gap-2 rounded-card border border-success/25 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>工作流已成功发布</span>
              </div>

              <div className="space-y-2" data-testid="publish-warnings-list">
                <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{publishWarnings.length} 条兼容性警告</span>
                </div>

                {publishWarnings.map((warning, index) => {
                  const expanded = expandedWarnings.has(index)

                  return (
                    <div
                      key={`${warning.sourceNodeId}-${warning.targetNodeId}-${String(index)}`}
                      className="overflow-hidden rounded-card border border-warning/25 bg-warning/5"
                      data-testid="publish-warning-item"
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 p-3 text-left text-sm text-foreground transition-colors hover:bg-warning/10"
                        onClick={() => toggleWarning(index)}
                        aria-expanded={expanded}
                        data-testid="publish-warning-toggle"
                      >
                        {expanded ? (
                          <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        ) : (
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        )}
                        <span>{warning.message}</span>
                      </button>

                      {expanded && (
                        <div
                          className="border-t border-warning/25 px-3 py-2 text-xs text-muted"
                          data-testid="publish-warning-detail"
                        >
                          <div className="flex flex-wrap items-center gap-1 font-mono">
                            <span>{warning.sourceNodeId}.{warning.sourcePort.name}</span>
                            <Badge variant="warning" size="sm">
                              {warning.sourcePort.dataType}
                            </Badge>
                            <span>→</span>
                            <span>{warning.targetNodeId}.{warning.targetPort.name}</span>
                            <Badge variant="warning" size="sm">
                              {warning.targetPort.dataType}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </SheetBody>

            <SheetFooter>
              <Button
                type="button"
                onClick={() => { resetForm(); onOpenChange(false) }}
                data-testid="publish-warnings-done"
              >
                完成
              </Button>
            </SheetFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <SheetBody className="space-y-6">
              {validationErrors.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-card border border-error/25 bg-error/10 p-3 text-sm text-error"
                  data-testid="publish-validation-error"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    {validationErrors.map((message) => (
                      <p key={message} data-testid="publish-validation-error-item">
                        {message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="publish-label">
                  <Label>
                    发布标签 <span className="text-muted">（可选）</span>
                  </Label>
                </label>
                <Input
                  id="publish-label"
                  type="text"
                  maxLength={255}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="例如：v1.0 正式版"
                  data-testid="publish-label-input"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="publish-release-notes">
                  <Label>
                    发布说明 <span className="text-muted">（可选）</span>
                  </Label>
                </label>
                <Textarea
                  id="publish-release-notes"
                  maxLength={1000}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="可填写本次发布的变更说明、注意事项或上线备注"
                  className="min-h-28"
                  data-testid="publish-release-notes-input"
                />
              </div>

              <fieldset>
                <legend className="mb-2 text-xs font-medium text-foreground">
                  发布版本来源
                </legend>
                <RadioGroup
                  value={versionSource}
                  onValueChange={(value) => {
                    setVersionSource(value === 'existing' ? 'existing' : 'current')
                  }}
                >
                  {VERSION_SOURCE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      htmlFor={option.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-card border p-3 transition-colors',
                        versionSource === option.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-border-hover hover:bg-surface-elevated',
                      )}
                      data-testid={option.testId}
                    >
                      <RadioGroupItem
                        id={option.id}
                        value={option.value}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          {option.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>

              {versionSource === 'existing' && (
                <div className="flex flex-col gap-1.5">
                  <Label id="version-select-label">选择记录</Label>
                  {unpublishedVersions.length === 0 ? (
                    <p className="text-xs text-muted">暂无可发布记录，请先保存快照</p>
                  ) : (
                    <Select
                      value={selectedVersionId}
                      onValueChange={setSelectedVersionId}
                    >
                      <SelectTrigger
                        aria-labelledby="version-select-label"
                        data-testid="version-select"
                      >
                        <SelectValue placeholder="请选择记录..." />
                      </SelectTrigger>
                      <SelectContent>
                        {unpublishedVersions.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {formatPublishableRecordLabel(v)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </SheetBody>

            <SheetFooter>
              <SheetClose asChild>
                <Button type="button" variant="ghost" data-testid="cancel-publish">
                  取消
                </Button>
              </SheetClose>
              <Button
                type="submit"
                className="bg-success text-white hover:bg-success/90"
                disabled={publishMutation.isPending}
                data-testid="confirm-publish"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                发布
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
})
