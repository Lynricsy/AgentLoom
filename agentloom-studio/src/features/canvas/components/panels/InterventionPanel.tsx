import { memo, useState, useCallback } from 'react'
import { Check, Pencil, X, AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  useNodeIntervention,
  useNodeExecutionState,
  useExecutionActions,
  useExecutionId,
} from '@/features/execution/stores/executionStore'

type InterventionMode = 'idle' | 'modifying' | 'rejecting'

function formatInterventionContent(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}

interface InterventionPanelProps {
  nodeId: string
}

/**
 * 人工干预面板 — 当节点进入 waiting_intervention 状态时显示。
 * 展示 AI 决策建议（rationale / confidence / suggestedContent），
 * 提供批准、修改、拒绝三种操作。
 */
export const InterventionPanel = memo(function InterventionPanel({
  nodeId,
}: InterventionPanelProps) {
  const intervention = useNodeIntervention(nodeId)
  const nodeState = useNodeExecutionState(nodeId)
  const executionId = useExecutionId()
  const { submitIntervention } = useExecutionActions()

  const [mode, setMode] = useState<InterventionMode>('idle')
  const [modifiedContent, setModifiedContent] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stepId = nodeState?.stepId
  const isSubmitting = intervention?.submitting ?? false

  const handleApprove = useCallback(async () => {
    if (!executionId || !stepId) return
    setError(null)
    try {
      await submitIntervention(executionId, stepId, { action: 'approve' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败'
      setError(msg)
    }
  }, [executionId, stepId, submitIntervention])

  const handleStartModify = useCallback(() => {
    setMode('modifying')
    setModifiedContent(
      formatInterventionContent(intervention?.decision?.suggestedContent) ||
        intervention?.partialContent ||
        '',
    )
    setFeedback('')
    setError(null)
  }, [intervention])

  const handleStartReject = useCallback(() => {
    setMode('rejecting')
    setFeedback('')
    setError(null)
  }, [])

  const handleSubmitModify = useCallback(async () => {
    if (!executionId || !stepId) return
    setError(null)
    try {
      await submitIntervention(executionId, stepId, {
        action: 'modify',
        modifiedContent,
        feedback: feedback || undefined,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败'
      setError(msg)
    }
  }, [executionId, stepId, modifiedContent, feedback, submitIntervention])

  const handleSubmitReject = useCallback(async () => {
    if (!executionId || !stepId) return
    setError(null)
    try {
      await submitIntervention(executionId, stepId, {
        action: 'reject',
        feedback: feedback || undefined,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败'
      setError(msg)
    }
  }, [executionId, stepId, feedback, submitIntervention])

  const handleCancel = useCallback(() => {
    setMode('idle')
    setError(null)
  }, [])

  // 未进入干预状态或缺少关键 ID 时不渲染
  if (
    !intervention ||
    nodeState?.status !== 'waiting_intervention' ||
    !executionId ||
    !stepId
  ) {
    return null
  }

  const { decision } = intervention
  const suggestedContentText = formatInterventionContent(decision?.suggestedContent)

  return (
    <div
      className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
      data-testid="intervention-panel"
    >
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <h4 className="text-xs font-semibold text-amber-300">需要人工干预</h4>
      </div>

      {/* AI 决策详情 */}
      {decision && (
        <dl className="mt-3 space-y-2 text-xs">
          {decision.rationale && (
            <div>
              <dt className="text-muted-foreground">决策理由</dt>
              <dd className="mt-0.5 leading-5 text-foreground">
                {decision.rationale}
              </dd>
            </div>
          )}
          {decision.confidence != null && (
            <div>
              <dt className="text-muted-foreground">置信度</dt>
              <dd className="mt-0.5 text-foreground">
                {Math.round(decision.confidence * 100)}%
              </dd>
            </div>
          )}
          {suggestedContentText && (
            <div>
              <dt className="text-muted-foreground">建议内容</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-[#050816] px-2 py-1.5 font-mono leading-5 text-slate-100">
                {suggestedContentText}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* 错误提示 */}
      {error && (
        <p
          className="mt-2 text-xs text-error"
          data-testid="intervention-error"
        >
          {error}
        </p>
      )}

      {/* 空闲态：三个操作按钮 */}
      {mode === 'idle' && (
        <div className="mt-3 flex gap-2" data-testid="intervention-actions">
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={isSubmitting}
            data-testid="intervention-approve"
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {isSubmitting ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Check className="mr-1 h-3 w-3" />
            )}
            批准
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartModify}
            disabled={isSubmitting}
            data-testid="intervention-modify"
          >
            <Pencil className="mr-1 h-3 w-3" />
            修改
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStartReject}
            disabled={isSubmitting}
            data-testid="intervention-reject"
            className="border-error/40 text-error hover:bg-error/10"
          >
            <X className="mr-1 h-3 w-3" />
            拒绝
          </Button>
        </div>
      )}

      {/* 修改模式 */}
      {mode === 'modifying' && (
        <div className="mt-3 space-y-2" data-testid="intervention-modify-form">
          <label
            htmlFor="intervention-modified-content"
            className="text-xs text-muted-foreground"
          >
            修改内容
          </label>
          <textarea
            id="intervention-modified-content"
            className="w-full rounded-lg border border-border/70 bg-[#050816] px-2 py-1.5 font-mono text-xs leading-5 text-slate-100 focus:border-primary/50 focus:outline-none"
            rows={5}
            value={modifiedContent}
            onChange={(e) => setModifiedContent(e.target.value)}
            data-testid="intervention-modified-content"
          />
          <label
            htmlFor="intervention-feedback"
            className="text-xs text-muted-foreground"
          >
            反馈（可选）
          </label>
          <textarea
            id="intervention-feedback"
            className="w-full rounded-lg border border-border/70 bg-[#050816] px-2 py-1.5 font-mono text-xs leading-5 text-slate-100 focus:border-primary/50 focus:outline-none"
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="可选：说明修改原因..."
            data-testid="intervention-feedback"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmitModify}
              disabled={isSubmitting}
              data-testid="intervention-submit-modify"
            >
              {isSubmitting && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              提交修改
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 拒绝模式 */}
      {mode === 'rejecting' && (
        <div
          className="mt-3 space-y-2"
          data-testid="intervention-reject-form"
        >
          <label
            htmlFor="intervention-reject-feedback"
            className="text-xs text-muted-foreground"
          >
            拒绝原因（可选）
          </label>
          <textarea
            id="intervention-reject-feedback"
            className="w-full rounded-lg border border-border/70 bg-[#050816] px-2 py-1.5 font-mono text-xs leading-5 text-slate-100 focus:border-primary/50 focus:outline-none"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="可选：说明拒绝原因..."
            data-testid="intervention-reject-feedback"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmitReject}
              disabled={isSubmitting}
              data-testid="intervention-submit-reject"
              className="bg-error text-white hover:bg-error/90"
            >
              {isSubmitting && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              确认拒绝
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              取消
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})
