import { memo, useCallback, useMemo } from 'react'
import { Play } from 'lucide-react'
import { useCanvasActions, useCanvasNodes } from '../../stores/canvasStore'
import {
  buildIterationStartOutputPorts,
  buildLoopStartOutputPorts,
  createDefaultIterationStartNodeConfig,
  createDefaultLoopStartNodeConfig,
  getCompoundExtraInputPortIds,
} from '../../types/controlFlow.types'
import type {
  IterationStartNodeConfig,
  LoopStartNodeConfig,
} from '../../types/controlFlow.types'
import type { PortDefinition } from '../../types/nodeTypeRegistry'

interface CompoundStartConfigPanelProps {
  nodeId: string
  nodeType: 'loop-start' | 'iteration-start'
  parentId?: string
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

type CompoundStartNodeConfig = LoopStartNodeConfig | IterationStartNodeConfig
type ToggleEntry = readonly [key: string, label: string]

export const CompoundStartConfigPanel = memo(function CompoundStartConfigPanel({
  nodeId,
  nodeType,
  parentId,
  config,
  onApply,
}: CompoundStartConfigPanelProps) {
  const nodes = useCanvasNodes()
  const { updateNodeData } = useCanvasActions()
  const parentNode = nodes.find((node) => node.id === parentId)
  const extraInputIds = useMemo<readonly string[]>(
    () =>
      parentNode
        ? getCompoundExtraInputPortIds(
            (Array.isArray(parentNode.data.inputPorts)
              ? parentNode.data.inputPorts
              : []) as PortDefinition[],
          )
        : [],
    [parentNode],
  )

  const parsedConfig = useMemo<CompoundStartNodeConfig>(
    () =>
      nodeType === 'loop-start'
        ? {
            ...createDefaultLoopStartNodeConfig(),
            ...(config ?? {}),
          }
        : {
            ...createDefaultIterationStartNodeConfig(),
            ...(config ?? {}),
          },
    [config, nodeType],
  )

  const syncOutputPorts = useCallback(
    (nextConfig: CompoundStartNodeConfig) => {
      if (nodeType === 'loop-start') {
        updateNodeData(nodeId, {
          outputPorts: buildLoopStartOutputPorts(
            extraInputIds,
            nextConfig as LoopStartNodeConfig,
          ),
        })
        return
      }

      updateNodeData(nodeId, {
        outputPorts: buildIterationStartOutputPorts(
          extraInputIds,
          nextConfig as IterationStartNodeConfig,
        ),
      })
    },
    [extraInputIds, nodeId, nodeType, updateNodeData],
  )

  const handleToggle = useCallback(
    (key: string) => {
      const nextConfig =
        nodeType === 'loop-start'
          ? ({
              ...(parsedConfig as LoopStartNodeConfig),
              [key]:
                !(
                  parsedConfig as LoopStartNodeConfig &
                    Record<keyof LoopStartNodeConfig, boolean>
                )[key as keyof LoopStartNodeConfig],
            } satisfies LoopStartNodeConfig)
          : ({
              ...(parsedConfig as IterationStartNodeConfig),
              [key]:
                !(
                  parsedConfig as IterationStartNodeConfig &
                    Record<keyof IterationStartNodeConfig, boolean>
                )[key as keyof IterationStartNodeConfig],
            } satisfies IterationStartNodeConfig)
      onApply({ config: nextConfig })
      syncOutputPorts(nextConfig)
    },
    [nodeType, onApply, parsedConfig, syncOutputPorts],
  )

  const toggleEntries = useMemo<readonly ToggleEntry[]>(
    () =>
      nodeType === 'loop-start'
        ? ([
            ['exposePreviousResult', '暴露上一轮结果'],
            ['exposeIsFirst', '暴露首轮标记'],
          ] as const)
        : ([
            ['exposeTotal', '暴露总数'],
            ['exposeIsFirst', '暴露首项标记'],
            ['exposeIsLast', '暴露末项标记'],
          ] as const),
    [nodeType],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Play className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          {nodeType === 'loop-start' ? 'Loop Start' : 'Iteration Start'}
        </span>
      </div>

      <div className="space-y-2">
        {toggleEntries.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={(parsedConfig as unknown as Record<string, boolean>)[key] === true}
              onChange={() => handleToggle(key)}
              className="h-4 w-4 rounded border border-border"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
})
