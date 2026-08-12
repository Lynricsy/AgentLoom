import { memo, useCallback } from 'react'
import { HTTPError } from 'ky'
import { formatAutonomyModeValue } from '@/features/organization-autonomy-policy/lib/autonomyModePolicy'
import { useCanvasStore } from '@/features/canvas/stores/canvasStore'
import type { ApiError } from '@/shared/types/api'
import { useToast } from '@/shared/ui/toast'
import {
  useApplySuggestion,
  useDismissSuggestion,
  useNodeSuggestions,
} from '../api/optimization-suggestion-queries'
import type { SuggestionType } from '../types/optimization-suggestion.types'
import { OptimizationSuggestionCard } from './OptimizationSuggestionCard'

/**
 * 当前架构下「采纳」真正有执行落点的建议类型 —— 现在一个都没有，故为空。
 *
 * workflow agent 节点的模型、工具、超时由所绑定的 Agent Definition 快照决定：
 * 服务端把 `model_downgrade` / `timeout_adjustment` / `tool_pruning` 写进节点
 * `data.config` 的 modelId / timeoutMs / tools，但执行路径不读这些字段。
 * `autonomy_upgrade` 写的 autonomy 镜像字段也不进入 agent 执行（`createSession()`
 * 只传 Agent Definition 编译出的 runtimeConfig / systemPrompt），它仅在发布时用于
 * 组织自治上限校验，属于治理标记，不改变 agent 行为。
 *
 * 因此四类建议一律禁用采纳。将来某类建议真正接上执行路径后，把它加进这里即可恢复
 * 采纳入口——这是唯一需要改的地方。
 */
const APPLICABLE_SUGGESTION_TYPES: ReadonlySet<SuggestionType> = new Set<SuggestionType>()

interface OptimizationSuggestionsPanelProps {
  workflowDefinitionId: string
  nodeId: string
}

type ApiProblemDetails = ApiError & {
  errors?: Array<{ field?: string; message?: string }>
  extensions?: {
    currentVersion?: number
    autonomyCap?: string
    reasonCode?: string
    replacementMode?: string
  }
}

function resolveProblemDetail(payload: ApiProblemDetails, fallback: string): string {
  return payload.detail ?? payload.errors?.[0]?.message ?? fallback
}

function buildPolicyBlockedMessage(payload: ApiProblemDetails, fallback: string): string {
  const detail = resolveProblemDetail(payload, fallback)
  const extras = [
    payload.extensions?.autonomyCap
      ? `组织上限：${formatAutonomyModeValue(payload.extensions.autonomyCap)}`
      : null,
    payload.extensions?.replacementMode
      ? `建议改为：${formatAutonomyModeValue(payload.extensions.replacementMode)}`
      : null,
    payload.extensions?.reasonCode ? `原因：${payload.extensions.reasonCode}` : null,
  ].filter((value): value is string => value != null)

  if (extras.length === 0) {
    return detail
  }

  return `${detail}（${extras.join('；')}）`
}

async function resolveMutationErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!(error instanceof HTTPError)) {
    return fallback
  }

  try {
    const payload = await error.response.json<ApiProblemDetails>()
    if (payload.detail && payload.extensions?.currentVersion != null) {
      return `${payload.detail}（当前版本 ${payload.extensions.currentVersion}）`
    }

    if (payload.extensions?.autonomyCap || payload.extensions?.replacementMode) {
      return buildPolicyBlockedMessage(payload, fallback)
    }

    return resolveProblemDetail(payload, fallback)
  } catch {
    return fallback
  }
}

export const OptimizationSuggestionsPanel = memo(function OptimizationSuggestionsPanel({
  workflowDefinitionId,
  nodeId,
}: OptimizationSuggestionsPanelProps) {
  const currentWorkflowId = useCanvasStore((state) => state.workflowId)
  const isDirty = useCanvasStore((state) => state.isDirty)
  const { notify } = useToast()
  const {
    data: suggestions,
    isLoading,
    isError,
    error,
  } = useNodeSuggestions(workflowDefinitionId, nodeId)

  const applyMutation = useApplySuggestion()
  const dismissMutation = useDismissSuggestion()

  const handleApply = useCallback(
    (id: string) => {
      if (currentWorkflowId === workflowDefinitionId && isDirty) {
        notify({
          title: '请先保存当前画布',
          description:
            '当前画布有未保存修改。为避免服务端建议覆盖本地编辑，请等待自动保存完成后再采纳建议。',
          variant: 'warning',
        })
        return
      }

      applyMutation.mutate(id, {
        onSuccess: () => {
          notify({
            title: '优化建议已采纳',
            description: '工作流配置已更新，建议列表和画布数据正在刷新。',
            variant: 'success',
          })
        },
        onError: async (applyError) => {
          notify({
            title: '采纳优化建议失败',
            description: await resolveMutationErrorMessage(
              applyError,
              '采纳优化建议失败，请刷新后重试。',
            ),
            variant: 'error',
          })
        },
      })
    },
    [applyMutation, currentWorkflowId, isDirty, notify, workflowDefinitionId],
  )

  const handleDismiss = useCallback(
    (id: string) => {
      dismissMutation.mutate(id, {
        onSuccess: () => {
          notify({
            title: '优化建议已忽略',
            description: '该建议已标记为忽略，统计数据会自动刷新。',
            variant: 'success',
          })
        },
        onError: async (dismissError) => {
          notify({
            title: '忽略优化建议失败',
            description: await resolveMutationErrorMessage(
              dismissError,
              '忽略优化建议失败，请刷新后重试。',
            ),
            variant: 'error',
          })
        },
      })
    },
    [dismissMutation, notify],
  )

  if (isLoading) {
    return (
      <div
        className="space-y-3 px-4 py-3"
        data-testid="optimization-suggestions-panel"
      >
        {['skeleton-1', 'skeleton-2'].map((key) => (
          <div
            key={key}
            className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 animate-pulse"
          >
            <div className="h-4 w-28 rounded bg-zinc-700/60" />
            <div className="h-3 w-full rounded bg-zinc-700/40" />
            <div className="h-3 w-2/3 rounded bg-zinc-700/40" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="px-4 py-3 text-sm text-red-400"
        data-testid="optimization-suggestions-panel"
      >
        加载优化建议失败: {error?.message ?? '未知错误'}
      </div>
    )
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div
        className="px-4 py-3 text-sm text-zinc-500"
        data-testid="optimization-suggestions-panel"
      >
        暂无优化建议
      </div>
    )
  }

  return (
    <div
      className="space-y-3 px-4 py-3"
      data-testid="optimization-suggestions-panel"
    >
      {/* 保存提示只在确实存在可采纳建议时才有意义，否则会暗示用户「保存后就能采纳」 */}
      {suggestions.some((suggestion) =>
        APPLICABLE_SUGGESTION_TYPES.has(suggestion.suggestionType),
      ) &&
      currentWorkflowId === workflowDefinitionId &&
      isDirty ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          画布存在未保存修改。请先等待自动保存完成，再采纳优化建议，避免覆盖本地编辑。
        </div>
      ) : null}
      <h3 className="text-sm font-medium text-zinc-200">
        优化建议
        <span className="ml-1.5 text-xs text-zinc-500">({suggestions.length})</span>
      </h3>
      {suggestions.map((suggestion) => (
        <OptimizationSuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          onApply={handleApply}
          onDismiss={handleDismiss}
          actionsDisabled={applyMutation.isPending || dismissMutation.isPending}
          canApply={APPLICABLE_SUGGESTION_TYPES.has(suggestion.suggestionType)}
        />
      ))}
    </div>
  )
})
