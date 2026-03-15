import { memo, useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2, Store, X, XCircle } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useWorkflow } from '@/features/workflow'
import { useSubmitMarketplaceListing } from '../api/marketplaceMutations'
import {
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceReviewCheck,
  type MarketplaceReviewResult,
} from '../types'

const L = MARKETPLACE_REVIEW_LIMITS

const formSchema = z.object({
  title: z
    .string()
    .min(L.titleMinLength, `标题至少 ${L.titleMinLength} 个字符`)
    .max(L.titleMaxLength, `标题最多 ${L.titleMaxLength} 个字符`),
  summary: z
    .string()
    .min(L.summaryMinLength, `简介至少 ${L.summaryMinLength} 个字符`)
    .max(L.summaryMaxLength, `简介最多 ${L.summaryMaxLength} 个字符`),
  coverImageUrl: z
    .string()
    .url('请输入有效的 URL')
    .or(z.literal(''))
    .optional(),
})

type FormValues = z.infer<typeof formSchema>

interface MarketplacePublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
}

const ReviewCheckList = memo(function ReviewCheckList({
  checks,
}: {
  checks: MarketplaceReviewCheck[]
}) {
  return (
    <ul className="space-y-2" data-testid="review-check-list">
      {checks.map((check) => (
        <li
          key={check.code}
          className="flex items-start gap-2 text-sm"
          data-testid="review-check-item"
        >
          {check.status === 'passed' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <p className={check.status === 'passed' ? 'text-foreground' : 'text-red-400'}>
              {check.message}
            </p>
            {check.fixHint && (
              <p className="mt-0.5 text-xs text-muted-foreground">{check.fixHint}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
})

export { ReviewCheckList }

type DialogState =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'review-failed'; result: MarketplaceReviewResult }
  | { kind: 'conflict' }

export const MarketplacePublishDialog = memo(function MarketplacePublishDialog({
  open,
  onOpenChange,
  workflowId,
}: MarketplacePublishDialogProps) {
  const { data: workflow } = useWorkflow(workflowId)
  const submitMutation = useSubmitMarketplaceListing()

  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagError, setTagError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>({ kind: 'form' })
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const publishedVersionId = workflow?.publishedVersionId ?? null

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: '', summary: '', coverImageUrl: '' },
  })

  useEffect(() => {
    if (open) {
      resetForm({ title: '', summary: '', coverImageUrl: '' })
      setTags([])
      setTagInput('')
      setTagError(null)
      setDialogState({ kind: 'form' })
      submitMutation.reset()
    }
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [open, resetForm, submitMutation])

  const addTagsFromInput = useCallback(
    (raw: string) => {
      const incoming = raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const tooLong = incoming.find((t) => t.length > L.tagMaxLength)
      if (tooLong) {
        setTagError(`标签"${tooLong}"超过 ${L.tagMaxLength} 个字符`)
        return
      }

      const merged = Array.from(new Set([...tags, ...incoming]))
      if (merged.length > L.maxTags) {
        setTagError(`最多添加 ${L.maxTags} 个标签`)
        return
      }

      setTags(merged)
      setTagInput('')
      setTagError(null)
    },
    [tags],
  )

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        if (tagInput.trim()) {
          addTagsFromInput(tagInput)
        }
      }
      if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
        setTags((prev) => prev.slice(0, -1))
      }
    },
    [tagInput, tags.length, addTagsFromInput],
  )

  const removeTag = useCallback((tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove))
    setTagError(null)
  }, [])

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!publishedVersionId) return
      setTagError(null)

      if (tags.length < L.minTags) {
        setTagError(`请至少添加 ${L.minTags} 个标签`)
        return
      }

      setDialogState({ kind: 'submitting' })

      try {
        const response = await submitMutation.mutateAsync({
          workflowVersionId: publishedVersionId,
          title: values.title,
          summary: values.summary,
          tags,
          coverImageUrl: values.coverImageUrl || undefined,
        })

        if (response.reviewResult.outcome === 'passed') {
          setDialogState({ kind: 'success' })
          successTimerRef.current = setTimeout(() => {
            onOpenChange(false)
          }, 2000)
        } else {
          setDialogState({ kind: 'review-failed', result: response.reviewResult })
        }
      } catch (err) {
        if (
          err &&
          typeof err === 'object' &&
          'response' in err &&
          (err as { response?: Response }).response?.status === 409
        ) {
          setDialogState({ kind: 'conflict' })
        } else {
          setDialogState({ kind: 'form' })
        }
      }
    },
    [publishedVersionId, tags, submitMutation, onOpenChange],
  )

  const isSubmitting = dialogState.kind === 'submitting'
  const isFormDisabled = isSubmitting || !publishedVersionId

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-surface shadow-xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'max-h-[85vh] overflow-y-auto',
          )}
          data-testid="marketplace-publish-dialog"
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-amber-500" />
              <div>
                <Dialog.Title className="text-base font-medium">发布到市场</Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                  将工作流发布到市场供其他用户使用
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {dialogState.kind === 'success' && (
            <div className="flex flex-col items-center gap-3 px-6 py-12">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="text-lg font-medium">提交成功</p>
              <p className="text-sm text-muted-foreground">工作流已通过审核并上架市场</p>
              <button
                type="button"
                className="mt-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                onClick={() => onOpenChange(false)}
              >
                完成
              </button>
            </div>
          )}

          {dialogState.kind === 'conflict' && (
            <div className="flex flex-col items-center gap-3 px-6 py-12">
              <AlertCircle className="h-12 w-12 text-amber-500" />
              <p className="text-lg font-medium">已存在</p>
              <p className="text-sm text-muted-foreground">该工作流版本已提交到市场</p>
              <button
                type="button"
                className="mt-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => onOpenChange(false)}
              >
                关闭
              </button>
            </div>
          )}

          {dialogState.kind === 'review-failed' && (
            <div className="space-y-4 px-6 py-6">
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="h-5 w-5" />
                <p className="text-sm font-medium">审核未通过，请修复以下问题后重试</p>
              </div>
              <ReviewCheckList checks={dialogState.result.checks} />
              <button
                type="button"
                className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                onClick={() => setDialogState({ kind: 'form' })}
              >
                返回修改
              </button>
            </div>
          )}

          {(dialogState.kind === 'form' || dialogState.kind === 'submitting') && (
            <form
              className="space-y-4 px-6 py-6"
              onSubmit={handleSubmit(onSubmit)}
              data-testid="marketplace-publish-form"
            >
              {!publishedVersionId && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  工作流尚未发布，请先发布工作流后再提交到市场
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="mp-title" className="text-sm font-medium text-foreground">
                  标题 <span className="text-red-400">*</span>
                </label>
                <input
                  id="mp-title"
                  type="text"
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    errors.title ? 'border-red-500' : 'border-border',
                  )}
                  placeholder="为你的工作流取一个吸引人的标题"
                  disabled={isFormDisabled}
                  data-testid="marketplace-title-input"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-xs text-red-400">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-summary" className="text-sm font-medium text-foreground">
                  简介 <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="mp-summary"
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    'min-h-[80px] resize-y',
                    errors.summary ? 'border-red-500' : 'border-border',
                  )}
                  placeholder="描述工作流的用途和特点"
                  disabled={isFormDisabled}
                  data-testid="marketplace-summary-input"
                  {...register('summary')}
                />
                {errors.summary && (
                  <p className="text-xs text-red-400">{errors.summary.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-tags" className="text-sm font-medium text-foreground">
                  标签 <span className="text-red-400">*</span>
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({tags.length}/{L.maxTags})
                  </span>
                </label>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
                      >
                        {tag}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-background"
                          onClick={() => removeTag(tag)}
                          aria-label={`移除标签 ${tag}`}
                          disabled={isFormDisabled}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  id="mp-tags"
                  type="text"
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    tagError ? 'border-red-500' : 'border-border',
                  )}
                  placeholder="输入标签后按 Enter 或逗号分隔"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  onBlur={() => {
                    if (tagInput.trim()) addTagsFromInput(tagInput)
                  }}
                  disabled={isFormDisabled}
                  data-testid="marketplace-tags-input"
                />
                {tagError && <p className="text-xs text-red-400">{tagError}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-cover" className="text-sm font-medium text-foreground">
                  封面图片 URL
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(可选)</span>
                </label>
                <input
                  id="mp-cover"
                  type="text"
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    errors.coverImageUrl ? 'border-red-500' : 'border-border',
                  )}
                  placeholder="https://example.com/cover.png"
                  disabled={isFormDisabled}
                  {...register('coverImageUrl')}
                />
                {errors.coverImageUrl && (
                  <p className="text-xs text-red-400">{errors.coverImageUrl.message}</p>
                )}
              </div>

              <button
                type="submit"
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm',
                  isFormDisabled
                    ? 'cursor-not-allowed bg-muted text-muted-foreground'
                    : 'bg-amber-600 text-white hover:bg-amber-700',
                )}
                disabled={isFormDisabled}
                data-testid="marketplace-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交审核中...
                  </>
                ) : (
                  <>
                    <Store className="h-4 w-4" />
                    提交到市场
                  </>
                )}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})

export default MarketplacePublishDialog
