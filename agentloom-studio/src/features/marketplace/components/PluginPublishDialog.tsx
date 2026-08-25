import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { HTTPError } from 'ky'
import { AlertCircle, CheckCircle2, Loader2, Puzzle, XCircle } from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { cn } from '@/shared/lib/utils'
import {
  useSubmitPluginMarketplaceListing,
  useUpdatePluginMarketplaceListing,
} from '../api/marketplaceMutations'
import {
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_REVIEW_LIMITS,
  type MarketplaceCategory,
  type MarketplacePricingModel,
  type MarketplaceReviewResult,
  type PluginListingEditTarget,
} from '../types'
import { ListingTagsInput } from './ListingTagsInput'

const L = MARKETPLACE_REVIEW_LIMITS

/** Radix Select 不接受空串 value，用哨兵表示「不指定分类」 */
const NO_CATEGORY = '__none__'

/** 服务端 pricePerExecution：非负、最多 8 位小数的十进制字符串 */
const PRICE_PATTERN = /^\d+(\.\d{1,8})?$/

const formSchema = z
  .object({
    title: z
      .string()
      .min(L.titleMinLength, `标题至少 ${L.titleMinLength} 个字符`)
      .max(L.titleMaxLength, `标题最多 ${L.titleMaxLength} 个字符`),
    summary: z
      .string()
      .min(L.summaryMinLength, `简介至少 ${L.summaryMinLength} 个字符`)
      .max(L.summaryMaxLength, `简介最多 ${L.summaryMaxLength} 个字符`),
    category: z.string(),
    pricingModel: z.enum(['free', 'per_execution']),
    pricePerExecution: z.string(),
  })
  .refine(
    (values) =>
      values.pricingModel !== 'per_execution' ||
      PRICE_PATTERN.test(values.pricePerExecution.trim()),
    {
      path: ['pricePerExecution'],
      message: '请输入非负单价，最多 8 位小数',
    },
  )

type FormValues = z.infer<typeof formSchema>

const PRICING_OPTIONS: { value: MarketplacePricingModel; label: string }[] = [
  { value: 'free', label: '免费' },
  { value: 'per_execution', label: '按次计费' },
]

/**
 * 发布对话框的目标：新建时只需要插件本身，编辑时只需要 listing 预填值。
 * 用判别联合而不是可选字段，避免编辑态携带一个用不到的 pluginDbId。
 */
export type PluginPublishTarget =
  | { mode: 'create'; pluginDbId: string; pluginName: string }
  | { mode: 'edit'; pluginName: string; listing: PluginListingEditTarget }

interface PluginPublishDialogProps {
  /** 为 null 即关闭 */
  target: PluginPublishTarget | null
  onOpenChange: (open: boolean) => void
}

type DialogState =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'listed' }
  | { kind: 'review-failed'; result: MarketplaceReviewResult }
  | { kind: 'conflict'; detail: string }

function toFormValues(target: PluginPublishTarget | null): FormValues {
  const listing = target?.mode === 'edit' ? target.listing : undefined

  return {
    title: listing?.title ?? '',
    summary: listing?.summary ?? '',
    category: listing?.category ?? NO_CATEGORY,
    pricingModel: listing?.pricingModel ?? 'free',
    pricePerExecution: listing?.pricePerExecution ?? '',
  }
}

export const PluginPublishDialog = memo(function PluginPublishDialog({
  target,
  onOpenChange,
}: PluginPublishDialogProps) {
  const submitMutation = useSubmitPluginMarketplaceListing()
  const updateMutation = useUpdatePluginMarketplaceListing()

  const isEdit = target?.mode === 'edit'
  const open = target !== null

  const [tags, setTags] = useState<string[]>(
    target?.mode === 'edit' ? target.listing.tags : [],
  )
  const [tagError, setTagError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState<DialogState>({ kind: 'form' })

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(target),
  })

  const wasOpenRef = useRef(false)

  // 每次重新打开都按当前 target 重置，避免上一个插件/listing 的草稿泄漏过来
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false
      return
    }

    if (wasOpenRef.current) return

    wasOpenRef.current = true
    resetForm(toFormValues(target))
    setTags(target?.mode === 'edit' ? target.listing.tags : [])
    setTagError(null)
    setDialogState({ kind: 'form' })
  }, [open, resetForm, target])

  const pricingModel = watch('pricingModel')
  const category = watch('category')

  const onSubmit = useCallback(
    async (values: FormValues) => {
      if (!target) return

      setTagError(null)
      if (tags.length < L.minTags) {
        setTagError(`请至少添加 ${L.minTags} 个标签`)
        return
      }

      const categoryValue =
        values.category === NO_CATEGORY
          ? undefined
          : (values.category as MarketplaceCategory)
      const pricePerExecution =
        values.pricingModel === 'per_execution'
          ? values.pricePerExecution.trim()
          : undefined

      setDialogState({ kind: 'submitting' })

      try {
        const response =
          target.mode === 'edit'
            ? await updateMutation.mutateAsync({
                listingId: target.listing.id,
                request: {
                  title: values.title,
                  summary: values.summary,
                  category: categoryValue,
                  tags,
                  pricingModel: values.pricingModel,
                  pricePerExecution,
                },
              })
            : await submitMutation.mutateAsync({
                pluginDbId: target.pluginDbId,
                title: values.title,
                summary: values.summary,
                category: categoryValue,
                tags,
                pricingModel: values.pricingModel,
                pricePerExecution,
              })

        if (response.reviewResult.outcome === 'passed') {
          setDialogState({ kind: 'listed' })
        } else {
          setDialogState({ kind: 'review-failed', result: response.reviewResult })
        }
      } catch (err) {
        if (err instanceof HTTPError && err.response.status === 409) {
          setDialogState({
            kind: 'conflict',
            detail: '该插件已经有一条市场发布记录，请到「我的市场发布」编辑它。',
          })
        } else {
          setDialogState({ kind: 'form' })
        }
      }
    },
    [submitMutation, tags, target, updateMutation],
  )

  const isSubmitting = dialogState.kind === 'submitting'
  const failedChecks =
    dialogState.kind === 'review-failed'
      ? dialogState.result.checks.filter((check) => check.status === 'failed')
      : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        className="sm:max-h-[88vh]"
        data-testid="plugin-publish-dialog"
      >
        <DialogHeader className="flex-row items-start gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-card"
            style={{
              backgroundColor:
                'color-mix(in srgb, var(--color-node-plugin) 14%, transparent)',
              color: 'var(--color-node-plugin)',
            }}
          >
            <Puzzle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle>{isEdit ? '编辑市场发布' : '发布到市场'}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {isEdit
                ? `修改「${target?.pluginName ?? ''}」的上架信息`
                : `把插件「${target?.pluginName ?? ''}」上架到市场供其他组织安装`}
            </DialogDescription>
          </div>
        </DialogHeader>

        {dialogState.kind === 'listed' && (
          <DialogBody
            className="flex flex-col items-center gap-3 py-12"
            data-testid="plugin-publish-listed"
          >
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="text-lg font-medium text-foreground">审核通过</p>
            <p className="text-sm text-muted">
              {isEdit ? '修改已生效，插件仍在市场上架中' : '插件已上架到市场'}
            </p>
            <Button className="mt-2" onClick={() => onOpenChange(false)}>
              完成
            </Button>
          </DialogBody>
        )}

        {dialogState.kind === 'conflict' && (
          <DialogBody className="flex flex-col items-center gap-3 py-12">
            <AlertCircle className="h-12 w-12 text-warning" />
            <p className="text-lg font-medium text-foreground">已存在发布记录</p>
            <p className="text-center text-sm text-muted">{dialogState.detail}</p>
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
          <DialogBody className="space-y-4" data-testid="plugin-review-failed">
            <div className="flex items-center gap-2 text-error">
              <XCircle className="h-5 w-5" />
              <p className="text-sm font-medium">
                {isEdit
                  ? '重新审查未通过，该发布已被下架'
                  : '审核未通过，请修复以下问题后重试'}
              </p>
            </div>
            <ul className="space-y-2" data-testid="plugin-review-check-list">
              {failedChecks.map((check) => (
                <li
                  key={check.code}
                  className="rounded-card border border-error/25 bg-error/5 p-2.5"
                  data-testid="plugin-review-check-item"
                >
                  <p className="text-xs text-error">{check.message}</p>
                  {check.fixHint && (
                    <p className="mt-1 text-xs text-muted">{check.fixHint}</p>
                  )}
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDialogState({ kind: 'form' })}
            >
              返回修改
            </Button>
          </DialogBody>
        )}

        {(dialogState.kind === 'form' || isSubmitting) && (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={handleSubmit(onSubmit)}
            data-testid="plugin-publish-form"
          >
            <DialogBody className="space-y-4">
              {isEdit && (
                <div className="flex items-start gap-2 rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    保存后服务端会重新审查这条发布。若修改后的内容不合规，已上架的插件会被下架。
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="plugin-listing-title"
                  className="text-sm font-medium text-foreground"
                >
                  标题 <span className="text-error">*</span>
                </label>
                <Input
                  id="plugin-listing-title"
                  type="text"
                  className={cn(errors.title && 'border-error')}
                  placeholder="用一句话说明这个插件能做什么"
                  disabled={isSubmitting}
                  data-testid="plugin-listing-title-input"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="text-xs font-medium text-error">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="plugin-listing-summary"
                  className="text-sm font-medium text-foreground"
                >
                  简介 <span className="text-error">*</span>
                </label>
                <Textarea
                  id="plugin-listing-summary"
                  className={cn('min-h-20', errors.summary && 'border-error')}
                  placeholder="描述插件的节点能力、适用场景与限制"
                  disabled={isSubmitting}
                  data-testid="plugin-listing-summary-input"
                  {...register('summary')}
                />
                {errors.summary && (
                  <p className="text-xs font-medium text-error">
                    {errors.summary.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="plugin-listing-category"
                  className="text-sm font-medium text-foreground"
                >
                  分类
                  <span className="ml-1 text-xs font-normal text-muted">(可选)</span>
                </label>
                <Select
                  value={category}
                  onValueChange={(value) => setValue('category', value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger
                    id="plugin-listing-category"
                    data-testid="plugin-listing-category-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>不指定</SelectItem>
                    {MARKETPLACE_CATEGORIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ListingTagsInput
                id="plugin-listing-tags"
                tags={tags}
                onTagsChange={setTags}
                error={tagError}
                onErrorChange={setTagError}
                disabled={isSubmitting}
                testId="plugin-listing-tags-input"
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="plugin-listing-pricing"
                  className="text-sm font-medium text-foreground"
                >
                  计费模式 <span className="text-error">*</span>
                </label>
                <Select
                  value={pricingModel}
                  onValueChange={(value) =>
                    setValue('pricingModel', value as MarketplacePricingModel)
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger
                    id="plugin-listing-pricing"
                    data-testid="plugin-listing-pricing-select"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {pricingModel === 'per_execution' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="plugin-listing-price"
                    className="text-sm font-medium text-foreground"
                  >
                    每次执行单价 (USD) <span className="text-error">*</span>
                  </label>
                  <Input
                    id="plugin-listing-price"
                    type="text"
                    inputMode="decimal"
                    className={cn(errors.pricePerExecution && 'border-error')}
                    placeholder="0.01"
                    disabled={isSubmitting}
                    data-testid="plugin-listing-price-input"
                    {...register('pricePerExecution')}
                  />
                  {errors.pricePerExecution && (
                    <p className="text-xs font-medium text-error">
                      {errors.pricePerExecution.message}
                    </p>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                data-testid="plugin-listing-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交审查中...
                  </>
                ) : (
                  <>
                    <Puzzle className="h-4 w-4" />
                    {isEdit ? '保存并重新审查' : '提交到市场'}
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
