import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AnimatePresence, motion } from 'motion/react'
import { AlertCircle, CheckCircle2, Loader2, Store, XCircle } from 'lucide-react'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { fadeIn } from '@/shared/lib/motion'
import { cn } from '@/shared/lib/utils'
import { useWorkflow } from '@/features/workflow'
import { useSubmitMarketplaceListing } from '../api/marketplaceMutations'
import {
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceReviewCheck,
  type MarketplaceReviewResult,
} from '../types'
import { ListingTagsInput } from './ListingTagsInput'

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
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0 text-error" />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                'break-words',
                check.status === 'passed' ? 'text-foreground' : 'text-error',
              )}
            >
              {check.message}
            </p>
            {check.fixHint && (
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {check.fixHint}
              </p>
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
  const [tagError, setTagError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>({ kind: 'form' })
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

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
      return
    }

    if (wasOpenRef.current) {
      return
    }

    wasOpenRef.current = true
    resetForm({ title: '', summary: '', coverImageUrl: '' })
    setTags([])
    setTagError(null)
    setDialogState({ kind: 'form' })
    resetSubmitMutationRef.current()
  }, [open, resetForm])

  // 成功后 2s 自动关闭：计时在状态变为 success 的那一刻启动，与视图切换动画无关
  // （AnimatePresence mode="wait" 会等旧视图退场后才挂载成功视图，不能依赖新视图挂载）
  useEffect(() => {
    if (!open || dialogState.kind !== 'success') return
    const timer = setTimeout(() => onOpenChangeRef.current(false), 2000)
    return () => clearTimeout(timer)
  }, [open, dialogState.kind])

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
    [publishedVersionId, tags, submitMutation],
  )

  const isSubmitting = dialogState.kind === 'submitting'
  const isFormDisabled = isSubmitting || !publishedVersionId
  /** 表单与提交中共用同一视图，切换其它结果态时才做淡入淡出 */
  const viewKey = dialogState.kind === 'submitting' ? 'form' : dialogState.kind

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="sm:max-h-[88dvh]"
        data-testid="marketplace-publish-dialog"
      >
        <DialogHeader className="flex-row items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-lg"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-node-tool) 14%, transparent)',
              color: 'var(--color-node-tool)',
            }}
          >
            <Store className="size-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle>发布到市场</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              将工作流发布到市场供其他用户使用
            </DialogDescription>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {dialogState.kind === 'success' ? (
            <motion.div key={viewKey} {...fadeIn} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="flex flex-col items-center gap-3 py-12">
                <CheckCircle2 className="size-12 text-success" />
                <p className="text-lg font-medium text-foreground">提交成功</p>
                <p className="text-sm text-muted-foreground">工作流已通过审核并上架市场</p>
              </DialogBody>
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>完成</Button>
              </DialogFooter>
            </motion.div>
          ) : dialogState.kind === 'conflict' ? (
            <motion.div key={viewKey} {...fadeIn} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="flex flex-col items-center gap-3 py-12">
                <AlertCircle className="size-12 text-warning" />
                <p className="text-lg font-medium text-foreground">已存在</p>
                <p className="text-sm text-muted-foreground">该工作流版本已提交到市场</p>
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  关闭
                </Button>
              </DialogFooter>
            </motion.div>
          ) : dialogState.kind === 'review-failed' ? (
            <motion.div key={viewKey} {...fadeIn} className="flex min-h-0 flex-1 flex-col">
              <DialogBody className="space-y-4">
                <div className="flex items-center gap-2 text-error">
                  <XCircle className="size-5 shrink-0" />
                  <p className="text-sm font-medium">审核未通过，请修复以下问题后重试</p>
                </div>
                <ReviewCheckList checks={dialogState.result.checks} />
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogState({ kind: 'form' })}>
                  返回修改
                </Button>
              </DialogFooter>
            </motion.div>
          ) : (
            <motion.form
              key={viewKey}
              {...fadeIn}
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={handleSubmit(onSubmit)}
              data-testid="marketplace-publish-form"
            >
              <DialogBody className="space-y-4">
                {!publishedVersionId && (
                  <Alert variant="warning">
                    工作流尚未发布，请先发布工作流后再提交到市场
                  </Alert>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="mp-title" className="block text-sm font-medium text-foreground">
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
                    <p className="text-xs font-medium text-error" role="alert">
                      {errors.title.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="mp-summary" className="block text-sm font-medium text-foreground">
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
                    <p className="text-xs font-medium text-error" role="alert">
                      {errors.summary.message}
                    </p>
                  )}
                </div>

                <ListingTagsInput
                  id="mp-tags"
                  tags={tags}
                  onTagsChange={setTags}
                  error={tagError}
                  onErrorChange={setTagError}
                  disabled={isFormDisabled}
                  testId="marketplace-tags-input"
                />

                <div className="space-y-1.5">
                  <label htmlFor="mp-cover" className="block text-sm font-medium text-foreground">
                    封面图片 URL
                    <span className="ml-1 text-xs font-normal text-muted-foreground">（可选）</span>
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
                    <p className="text-xs font-medium text-error" role="alert">
                      {errors.coverImageUrl.message}
                    </p>
                  )}
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  type="submit"
                  disabled={isFormDisabled}
                  data-testid="marketplace-submit-btn"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      提交审核中…
                    </>
                  ) : (
                    <>
                      <Store />
                      提交到市场
                    </>
                  )}
                </Button>
              </DialogFooter>
            </motion.form>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
})

export default MarketplacePublishDialog
