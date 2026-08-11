import { useCallback, useMemo, useState } from 'react'

import { Loader2, Star } from 'lucide-react'

import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import { cn } from '@/shared/lib/utils'
import { useSubmitReview } from '../api/publicMarketplaceMutations'

interface ReviewFormProps {
  listingId: string
  onSuccess?: () => void
}

function hasResponseStatus(error: unknown): error is { response?: Response } {
  return typeof error === 'object' && error !== null && 'response' in error
}

export function ReviewForm({ listingId, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [content, setContent] = useState('')
  const [hoveredRating, setHoveredRating] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { notify } = useToast()
  const submitReview = useSubmitReview()

  const activeRating = hoveredRating ?? rating
  const remainingCharacters = useMemo(() => 2000 - content.length, [content])

  const handleSubmit = useCallback(async () => {
    if (rating < 1) {
      setErrorMessage('请选择 1 到 5 星评分。')
      return
    }

    setErrorMessage(null)

    try {
      await submitReview.mutateAsync({
        listingId,
        body: {
          rating,
          content: content.trim() || undefined,
        },
      })

      setRating(0)
      setContent('')
      setHoveredRating(null)
      notify({
        title: '评价已提交',
        description: '感谢你的反馈，评价已发布。',
        variant: 'success',
      })
      onSuccess?.()
    } catch (error) {
      if (hasResponseStatus(error) && error.response?.status === 409) {
        const message = '你已经评价过这个工作流了。'
        setErrorMessage(message)
        notify({
          title: '无法重复评价',
          description: message,
          variant: 'warning',
        })
        return
      }

      const message = '评价提交失败，请稍后重试。'
      setErrorMessage(message)
      notify({
        title: '提交失败',
        description: message,
        variant: 'error',
      })
    }
  }, [content, listingId, notify, onSuccess, rating, submitReview])

  return (
    <div
      className="space-y-4 rounded-card border border-border bg-surface-elevated p-4"
      data-testid="review-form"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">写下你的评价</h4>
        <p className="text-xs text-muted">
          评分会帮助其他用户判断这个工作流是否适合他们。
        </p>
      </div>

      <fieldset className="flex items-center gap-1">
        <legend className="sr-only">选择评分</legend>
        {Array.from({ length: 5 }, (_, index) => {
          const value = index + 1
          const isActive = value <= activeRating

          return (
            <button
              key={`review-star-${String(value)}`}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHoveredRating(value)}
              onMouseLeave={() => setHoveredRating(null)}
              className="rounded p-1 text-muted transition-colors hover:text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              aria-label={`选择 ${value} 星`}
            >
              <Star
                className={cn('h-5 w-5', isActive && 'fill-warning text-warning')}
              />
            </button>
          )
        })}
      </fieldset>

      <div className="space-y-2">
        <label
          htmlFor="review-content"
          className="block text-sm font-medium text-foreground"
        >
          评价内容（可选）
        </label>
        <Textarea
          id="review-content"
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            if (errorMessage) {
              setErrorMessage(null)
            }
          }}
          rows={4}
          maxLength={2000}
          className="resize-none"
          placeholder="分享这个工作流在真实场景中的使用感受。"
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={errorMessage ? 'font-medium text-error' : 'text-muted'}>
            {errorMessage ?? '你的反馈会公开展示在市场页。'}
          </span>
          <span className="shrink-0 text-muted-foreground">
            {remainingCharacters} 字剩余
          </span>
        </div>
      </div>

      <Button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitReview.isPending}
      >
        {submitReview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        提交评价
      </Button>
    </div>
  )
}
