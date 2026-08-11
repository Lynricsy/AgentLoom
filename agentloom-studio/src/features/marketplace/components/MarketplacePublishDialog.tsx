import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2, Store, X, XCircle } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
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

/** ky 抛出的 HTTPError 携带原始 Response，用于区分 409 冲突 */
function hasResponseStatus(error: unknown): error is { response?: Response } {
  return typeof error === 'object' && error !== null && 'response' in error
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
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          )}
          <div className="min-w-0 flex-1">
            <p className={check.status === 'passed' ? 'text-foreground' : 'text-error'}>
              {check.message}
            </p>
            {check.fixHint && (
              <p className="mt-0.5 text-xs text-muted">{check.fixHint}</p>
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
  const resetSubmitMutationRef = useRef(submitMutation.reset)
  const wasOpenRef = useRef(false)

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

  resetSubmitMutationRef.current = submitMutation.reset

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
      return
    }

    if (wasOpenRef.current) {
      return
    }

    wasOpenRef.current = true
    resetForm({ title: '', summary: '', coverImageUrl: '' })
    setTags([])
    setTagInput('')
    setTagError(null)
    setDialogState({ kind: 'form' })
    resetSubmitMutationRef.current()
  }, [open, resetForm])

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current)
        successTimerRef.current = null
      }
    }
  }, [])

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
        if (hasResponseStatus(err) && err.response?.status === 409) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="sm:max-h-[88vh]"
        data-testid="marketplace-publish-dialog"
      >
        <DialogHeader className="flex-row items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-card"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-node-tool) 14%, transparent)',
              color: 'var(--color-node-tool)',
            }}
          >
            <Store className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle>发布到市场</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              将工作流发布到市场供其他用户使用
            </DialogDescription>
          </div>
        </DialogHeader>

        {dialogState.kind === 'success' && (
          <DialogBody className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="text-lg font-medium text-foreground">提交成功</p>
            <p className="text-sm text-muted">工作流已通过审核并上架市场</p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              完成
            </Button>
          </DialogBody>
        )}

        {dialogState.kind === 'conflict' && (
          <DialogBody className="flex flex-col items-center gap-3 py-12">
            <AlertCircle className="h-12 w-12 text-warning" />
            <p className="text-lg font-medium text-foreground">已存在</p>
            <p className="text-sm text-muted">该工作流版本已提交到市场</p>
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => onOpenChange(false)}
            >
              关闭
            </Button>
          </DialogBody>
        )}

        {dialogState.kind === 'review-failed' && (
          <DialogBody className="space-y-4">
            <div className="flex items-center gap-2 text-error">
              <XCircle className="h-5 w-5" />
              <p className="text-sm font-medium">审核未通过，请修复以下问题后重试</p>
            </div>
            <ReviewCheckList checks={dialogState.result.checks} />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDialogState({ kind: 'form' })}
            >
              返回修改
            </Button>
          </DialogBody>
        )}

        {(dialogState.kind === 'form' || dialogState.kind === 'submitting') && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit(onSubmit)}
            data-testid="marketplace-publish-form"
          >
            <DialogBody className="space-y-4">
              {!publishedVersionId && (
                <div className="flex items-center gap-2 rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  工作流尚未发布，请先发布工作流后再提交到市场
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="mp-title" className="text-sm font-medium text-foreground">
                  标题 <span className="text-error">*</span>
                </label>
                <Input
                  id="mp-title"
                  type="text"
                  className={cn(errors.title && 'border-error')}
                  placeholder="为你的工作流取一个吸引人的标题"
                  disabled={isFormDisabled}
                  data-testid="marketplace-title-input"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-xs font-medium text-error">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-summary" className="text-sm font-medium text-foreground">
                  简介 <span className="text-error">*</span>
                </label>
                <Textarea
                  id="mp-summary"
                  className={cn('min-h-20', errors.summary && 'border-error')}
                  placeholder="描述工作流的用途和特点"
                  disabled={isFormDisabled}
                  data-testid="marketplace-summary-input"
                  {...register('summary')}
                />
                {errors.summary && (
                  <p className="text-xs font-medium text-error">
                    {errors.summary.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-tags" className="text-sm font-medium text-foreground">
                  标签 <span className="text-error">*</span>
                  <span className="ml-1 text-xs font-normal text-muted">
                    ({tags.length}/{L.maxTags})
                  </span>
                </label>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="pr-1 text-foreground">
                        {tag}
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-muted transition-colors hover:bg-background hover:text-foreground"
                          onClick={() => removeTag(tag)}
                          aria-label={`移除标签 ${tag}`}
                          disabled={isFormDisabled}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  id="mp-tags"
                  type="text"
                  className={cn(tagError && 'border-error')}
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
                {tagError && (
                  <p className="text-xs font-medium text-error">{tagError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="mp-cover" className="text-sm font-medium text-foreground">
                  封面图片 URL
                  <span className="ml-1 text-xs font-normal text-muted">(可选)</span>
                </label>
                <Input
                  id="mp-cover"
                  type="text"
                  className={cn(errors.coverImageUrl && 'border-error')}
                  placeholder="https://example.com/cover.png"
                  disabled={isFormDisabled}
                  {...register('coverImageUrl')}
                />
                {errors.coverImageUrl && (
                  <p className="text-xs font-medium text-error">
                    {errors.coverImageUrl.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
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
              </Button>
            </DialogBody>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
})

export default MarketplacePublishDialog
