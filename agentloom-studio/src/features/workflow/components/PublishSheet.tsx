import { memo, useCallback, useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import {
  usePublishWorkflow,
  type PublishWorkflowResponse,
} from '../api/versionMutations'
import { useWorkflowVersions } from '../api/versionQueries'
import { useToast } from '@/shared/ui/toast'
import type { PublishWarning } from '../types'

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

function formatPublishWarningDescription(warning: PublishWarning): string {
  return [
    warning.message,
    `${warning.sourceNodeId}.${warning.sourcePort.name} (${warning.sourcePort.dataType}) → ${warning.targetNodeId}.${warning.targetPort.name} (${warning.targetPort.dataType})`,
  ].join(' · ')
}

function notifyPublishWarnings(
  notify: ReturnType<typeof useToast>['notify'],
  response: PublishWorkflowResponse,
) {
  for (const warning of response.warnings ?? []) {
    notify({
      title: '发布兼容性警告',
      description: formatPublishWarningDescription(warning),
      variant: 'warning',
      duration: 7000,
    })
  }
}

export const PublishSheet = memo(function PublishSheet({
  open,
  workflowId,
  initialVersionId,
  onOpenChange,
}: PublishSheetProps) {
  const [label, setLabel] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [versionSource, setVersionSource] = useState<'current' | 'existing'>('current')
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])

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
        setValidationErrors(['请选择一个已有版本'])
        return
      }

      try {
        const response = await publishMutation.mutateAsync({
          label: label.trim() || undefined,
          releaseNotes: releaseNotes.trim() || undefined,
          versionId: versionSource === 'existing' ? selectedVersionId : undefined,
        })
        notify({
          title: '发布成功',
          description:
            response.warnings && response.warnings.length > 0
              ? `工作流已发布，并返回 ${response.warnings.length} 条兼容性警告`
              : '工作流已发布',
          variant: 'success',
        })
        notifyPublishWarnings(notify, response)
        resetForm()
        onOpenChange(false)
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

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-[420px] flex-col',
            'border-l border-border bg-surface shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          )}
          data-testid="publish-sheet"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-base font-medium">发布工作流</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                发布后工作流将可被执行引擎调用
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
                data-testid="close-publish-sheet"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* 内容 */}
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 space-y-6 px-6 py-4">
              {/* 验证错误 */}
              {validationErrors.length > 0 && (
                <div
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                  data-testid="publish-validation-error"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    {validationErrors.map((message) => (
                      <p
                        key={message}
                        data-testid="publish-validation-error-item"
                      >
                        {message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* 版本标签 */}
              <div>
                <label htmlFor="publish-label" className="text-sm font-medium">
                  版本标签 <span className="text-muted-foreground">（可选）</span>
                </label>
                <input
                  id="publish-label"
                  type="text"
                  maxLength={255}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="例如：v1.0 正式版"
                  className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="publish-label-input"
                />
              </div>

              <div>
                <label htmlFor="publish-release-notes" className="text-sm font-medium">
                  发布说明 <span className="text-muted-foreground">（可选）</span>
                </label>
                <textarea
                  id="publish-release-notes"
                  maxLength={1000}
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  placeholder="可填写本次发布的变更说明、注意事项或上线备注"
                  className="mt-1.5 min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="publish-release-notes-input"
                />
              </div>

              {/* 版本来源选择 */}
              <fieldset>
                <legend className="text-sm font-medium">发布版本来源</legend>
                <div className="mt-2 space-y-2">
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                      versionSource === 'current'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30',
                    )}
                    data-testid="source-current"
                  >
                    <input
                      type="radio"
                      name="versionSource"
                      value="current"
                      checked={versionSource === 'current'}
                      onChange={() => setVersionSource('current')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">当前画布快照</span>
                      <p className="text-xs text-muted-foreground">
                        将当前画布状态创建为新版本并发布
                      </p>
                    </div>
                  </label>

                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
                      versionSource === 'existing'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30',
                    )}
                    data-testid="source-existing"
                  >
                    <input
                      type="radio"
                      name="versionSource"
                      value="existing"
                      checked={versionSource === 'existing'}
                      onChange={() => setVersionSource('existing')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium">选择已有版本</span>
                      <p className="text-xs text-muted-foreground">
                        从已保存的版本中选择一个进行发布
                      </p>
                    </div>
                  </label>
                </div>
              </fieldset>

              {/* 已有版本选择 */}
              {versionSource === 'existing' && (
                <div>
                  <label htmlFor="version-select" className="text-sm font-medium">
                    选择版本
                  </label>
                  {unpublishedVersions.length === 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      暂无可发布的版本，请先保存版本
                    </p>
                  ) : (
                    <select
                      id="version-select"
                      value={selectedVersionId}
                      onChange={(e) => setSelectedVersionId(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      data-testid="version-select"
                    >
                      <option value="">请选择版本...</option>
                      {unpublishedVersions.map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.versionNumber}
                          {v.label ? ` - ${v.label}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* 底部操作 */}
            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
                  data-testid="cancel-publish"
                >
                  取消
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={publishMutation.isPending}
                data-testid="confirm-publish"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                发布
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
