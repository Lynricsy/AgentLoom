import { memo, useCallback, useMemo } from 'react'
import { ChevronDown, ChevronUp, CircleOff, FastForward, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/shared/ui/toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import type { PortDefinition } from '../../types/nodeTypeRegistry'
import {
  getCompoundExtraInputPortIds,
  buildJumpInputPorts,
  createDefaultJumpNodeConfig,
  COMPOUND_EXTRA_INPUT_PREFIX,
} from '../../types/controlFlow.types'
import { rewriteConditionExpressionPorts } from '../../types/condition.types'

interface JumpConfigPanelProps {
  nodeType: 'break' | 'continue'
  inputPorts: PortDefinition[]
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

function parseJumpConfig(config: Record<string, unknown>) {
  const defaults = createDefaultJumpNodeConfig()
  const portLabels =
    config.portLabels && typeof config.portLabels === 'object' && !Array.isArray(config.portLabels)
      ? (config.portLabels as Record<string, string>)
      : undefined
  return {
    ...defaults,
    ...(config ?? {}),
    mode: config.mode === 'expression' ? 'expression' : defaults.mode,
    expression:
      typeof config.expression === 'string' ? config.expression : defaults.expression,
    portLabels,
  }
}

function nextExtraInputId(inputPorts: readonly PortDefinition[]): string {
  const maxIndex = inputPorts.reduce((currentMax, port) => {
    if (!port.id.startsWith(COMPOUND_EXTRA_INPUT_PREFIX)) {
      return currentMax
    }

    const suffix = Number.parseInt(
      port.id.slice(COMPOUND_EXTRA_INPUT_PREFIX.length),
      10,
    )
    return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax
  }, -1)

  return `${COMPOUND_EXTRA_INPUT_PREFIX}${maxIndex + 1}`
}

export const JumpConfigPanel = memo(function JumpConfigPanel({
  nodeType,
  inputPorts,
  config,
  onApply,
}: JumpConfigPanelProps) {
  const { notify } = useToast()
  const parsed = useMemo(() => parseJumpConfig(config), [config])
  const extraInputIds = useMemo(
    () => getCompoundExtraInputPortIds(inputPorts),
    [inputPorts],
  )

  const handleModeChange = useCallback(
    (value: string) => {
      onApply({
        config: {
          ...parsed,
          mode: value === 'expression' ? 'expression' : 'always',
        },
      })
    },
    [onApply, parsed],
  )

  const handleExpressionChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onApply({
        config: {
          ...parsed,
          expression: event.target.value,
        },
      })
    },
    [onApply, parsed],
  )

  const handleAddInputPort = useCallback(() => {
    const nextExtraInputIds = [...extraInputIds, nextExtraInputId(inputPorts)]
    onApply({
      inputPorts: buildJumpInputPorts(nextExtraInputIds, parsed.portLabels),
      config: parsed,
    })
  }, [extraInputIds, inputPorts, onApply, parsed])

  const handleMoveInputPort = useCallback(
    (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= extraInputIds.length) {
        return
      }

      const nextExtraInputIds = [...extraInputIds]
      const current = nextExtraInputIds[index]
      const target = nextExtraInputIds[nextIndex]
      if (!current || !target) {
        return
      }

      nextExtraInputIds[index] = target
      nextExtraInputIds[nextIndex] = current

      const rewritten = rewriteConditionExpressionPorts(
        parsed.expression,
        extraInputIds,
        nextExtraInputIds,
      )
      if (!rewritten.ok) {
        notify({
          variant: 'error',
          description: rewritten.error ?? '控制节点表达式迁移失败。',
        })
        return
      }

      onApply({
        inputPorts: buildJumpInputPorts(nextExtraInputIds, parsed.portLabels),
        config: {
          ...parsed,
          expression: rewritten.expression,
        },
      })
    },
    [extraInputIds, notify, onApply, parsed],
  )

  const handleRemoveInputPort = useCallback(
    (portId: string) => {
      const nextExtraInputIds = extraInputIds.filter((currentId) => currentId !== portId)
      const rewritten = rewriteConditionExpressionPorts(
        parsed.expression,
        extraInputIds,
        nextExtraInputIds,
      )
      if (!rewritten.ok) {
        notify({
          variant: 'error',
          description: rewritten.error ?? '控制节点表达式迁移失败。',
        })
        return
      }

      const nextLabels = parsed.portLabels ? { ...parsed.portLabels } : undefined
      if (nextLabels) {
        delete nextLabels[portId]
      }
      const cleanLabels = nextLabels && Object.keys(nextLabels).length > 0 ? nextLabels : undefined

      onApply({
        inputPorts: buildJumpInputPorts(nextExtraInputIds, cleanLabels),
        config: {
          ...parsed,
          expression: rewritten.expression,
          portLabels: cleanLabels,
        },
      })
    },
    [extraInputIds, notify, onApply, parsed],
  )

  const handleRenameInputPort = useCallback(
    (portId: string, label: string, index: number) => {
      const defaultLabel = `输入 ${index + 1}`
      const nextLabels = { ...(parsed.portLabels ?? {}) }
      if (label && label !== defaultLabel) {
        nextLabels[portId] = label
      } else {
        delete nextLabels[portId]
      }
      const cleanLabels = Object.keys(nextLabels).length > 0 ? nextLabels : undefined
      onApply({
        inputPorts: buildJumpInputPorts(extraInputIds, cleanLabels),
        config: { ...parsed, portLabels: cleanLabels },
      })
    },
    [extraInputIds, onApply, parsed],
  )

  const actionMeta =
    nodeType === 'break'
      ? {
          icon: CircleOff,
          title: '跳出',
          description: '命中后立即结束整个 compound，当前轮半成品会被丢弃。',
        }
      : {
          icon: FastForward,
          title: '继续',
          description: '命中后立即跳过当前轮，进入下一轮并丢弃当前轮半成品。',
        }

  const Icon = actionMeta.icon

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">{actionMeta.title}</span>
      </div>

      <p className="text-[11px] leading-5 text-muted-foreground">
        {actionMeta.description}
      </p>

      <div>
        <label
          htmlFor={`${nodeType}-mode`}
          className="mb-2 block text-xs font-medium text-foreground"
        >
          触发模式
        </label>
        <Select value={parsed.mode} onValueChange={handleModeChange}>
          <SelectTrigger id={`${nodeType}-mode`} aria-label="触发模式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">总是触发</SelectItem>
            <SelectItem value="expression">表达式触发</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-foreground">表达式输入端口</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              通过 `ports[n]` 引用，例如 `ports[1].status === &quot;skip&quot;`。
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddInputPort}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>添加输入</span>
          </button>
        </div>

        {extraInputIds.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            当前没有额外输入端口；如需条件触发，请先添加输入。
          </p>
        ) : (
          <div className="space-y-1.5">
            {extraInputIds.map((portId, index) => (
              <div
                key={portId}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <input
                    type="text"
                    value={parsed.portLabels?.[portId] ?? `输入 ${index + 1}`}
                    onChange={(e) => handleRenameInputPort(portId, e.target.value, index)}
                    placeholder={`输入 ${index + 1}`}
                    className="min-w-0 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-foreground hover:border-border focus:border-primary/50 focus:outline-none"
                  />
                  <p className="px-1 text-[10px] font-mono text-muted-foreground">
                    {`ports[${index + 1}]`} · {portId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleMoveInputPort(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveInputPort(index, 1)}
                  disabled={index === extraInputIds.length - 1}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveInputPort(portId)}
                  className="rounded p-1 text-muted-foreground hover:bg-error/10 hover:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {parsed.mode === 'expression' ? (
        <div>
          <label
            htmlFor={`${nodeType}-expression`}
            className="mb-2 block text-xs font-medium text-foreground"
          >
            表达式
          </label>
          <textarea
            id={`${nodeType}-expression`}
            rows={4}
            value={parsed.expression}
            onChange={handleExpressionChange}
            placeholder="例如：ports[1] === 'skip'"
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground"
          />
        </div>
      ) : null}
    </div>
  )
})
