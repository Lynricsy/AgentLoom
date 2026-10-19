import { memo, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Pencil, X, AlertTriangle, Loader2 } from 'lucide-react'
import { FormField } from '@/shared/components/form-field/FormField'
import { fadeIn } from '@/shared/lib/motion'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import {
  useNodeIntervention,
  useNodeExecutionState,
  useExecutionActions,
  useExecutionId,
} from '../stores/executionStore'

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
 * 提供批准、修改、拒绝三种操作。画布节点配置面板与执行页节点详情共用，
 * 状态来自 executionStore（执行页与重进画布时均由服务端快照 hydrate）。
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
      className="rounded-lg border border-warning/40 bg-warning/5 p-3"
      data-testid="intervention-panel"
    >
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        <h4 className="text-xs font-semibold text-warning">需要人工干预</h4>
      </div>

      {/* AI 决策详情 */}
      {decision && (
        <dl className="mt-3 space-y-2 text-xs">
          {decision.rationale && (
            <div>
              <dt className="text-muted-foreground">决策理由</dt>
              <dd className="mt-0.5 break-words leading-5 text-foreground">
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
              <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-surface px-2 py-1.5 font-mono leading-5 text-foreground">
                {suggestedContentText}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* 错误提示 */}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="intervention-error"
            {...fadeIn}
            className="mt-2 whitespace-pre-wrap break-words text-xs text-error"
            data-testid="intervention-error"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* 空闲态按钮组 ↔ 修改 / 拒绝表单：同一位置的视图切换 */}
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'idle' ? (
          <motion.div
            key="idle"
            {...fadeIn}
            className="mt-3 flex flex-wrap gap-2"
            data-testid="intervention-actions"
          >
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isSubmitting}
              data-testid="intervention-approve"
              className="bg-success text-white hover:bg-success/90"
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Check />}
              批准
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartModify}
              disabled={isSubmitting}
              data-testid="intervention-modify"
            >
              <Pencil />
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
              <X />
              拒绝
            </Button>
          </motion.div>
        ) : mode === 'modifying' ? (
          <motion.div
            key="modifying"
            {...fadeIn}
            className="mt-3 space-y-3"
            data-testid="intervention-modify-form"
          >
            <FormField label="修改内容" htmlFor="intervention-modified-content">
              <Textarea
                id="intervention-modified-content"
                className="px-2 py-1.5 font-mono text-xs leading-5"
                rows={5}
                value={modifiedContent}
                onChange={(e) => setModifiedContent(e.target.value)}
                data-testid="intervention-modified-content"
              />
            </FormField>
            <FormField label="反馈（可选）" htmlFor="intervention-feedback">
              <Textarea
                id="intervention-feedback"
                className="px-2 py-1.5 font-mono text-xs leading-5"
                rows={2}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="可选：说明修改原因…"
                data-testid="intervention-feedback"
              />
            </FormField>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmitModify}
                disabled={isSubmitting}
                data-testid="intervention-submit-modify"
              >
                {isSubmitting && <Loader2 className="animate-spin" />}
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
          </motion.div>
        ) : (
          <motion.div
            key="rejecting"
            {...fadeIn}
            className="mt-3 space-y-3"
            data-testid="intervention-reject-form"
          >
            <FormField label="拒绝原因（可选）" htmlFor="intervention-reject-feedback">
              <Textarea
                id="intervention-reject-feedback"
                className="px-2 py-1.5 font-mono text-xs leading-5"
                rows={3}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="可选：说明拒绝原因…"
                data-testid="intervention-reject-feedback"
              />
            </FormField>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmitReject}
                disabled={isSubmitting}
                data-testid="intervention-submit-reject"
                variant="destructive"
              >
                {isSubmitting && <Loader2 className="animate-spin" />}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
