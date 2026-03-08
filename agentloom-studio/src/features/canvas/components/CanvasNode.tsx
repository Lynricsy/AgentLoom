import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { AlertTriangle, Brain } from 'lucide-react'
import { Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import {
  getLlmConfigState,
  getProviderInfo,
  parseLlmModelConfig,
  ProviderIcon,
  useLlmApiKeys,
} from '@/features/llm'
import type { CanvasNode } from '../types'
import { getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { NODE_CATEGORIES } from './nodeCategories'
import { LlmModelNodeBody } from './nodes/LlmModelNodeBody'
import { McpToolNodeBody } from './nodes/McpToolNodeBody'
import { TypedPort } from './TypedPort'
import { useCanvasActions, useCanvasStore } from '../stores/canvasStore'

function getNodeColorToken(
  nodeType: CanvasNode['data']['nodeType'],
  rawConfig: Record<string, unknown>,
  fallback: string,
  hasProviderDefaultKey = false,
) {
  if (nodeType !== 'llm-model') {
    return fallback
  }

  const state = getLlmConfigState(rawConfig, hasProviderDefaultKey)

  switch (state) {
    case 'unconfigured':
      return 'var(--color-muted)'
    case 'warning':
      return 'var(--color-warning)'
    default:
      return 'var(--color-type-model)'
  }
}

export const CanvasNodeShell = memo(function CanvasNodeShell({
  id,
  data,
  selected,
  isConnectable = true,
}: NodeProps<CanvasNode>) {
  const config = getNodeTypeConfig(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[data.category]
  const { data: activeApiKeys = [] } = useLlmApiKeys()
  const llmConfig = data.nodeType === 'llm-model' ? parseLlmModelConfig(data.config) : null
  const hasProviderDefaultKey = useMemo(() => {
    if (!llmConfig) {
      return false
    }

    return activeApiKeys.some((apiKey) => apiKey.provider === llmConfig.provider && apiKey.isDefault)
  }, [activeApiKeys, llmConfig])
  const llmState = data.nodeType === 'llm-model'
    ? getLlmConfigState(data.config, hasProviderDefaultKey)
    : null
  const providerInfo = llmConfig ? getProviderInfo(llmConfig.provider) : null
  const colorToken = getNodeColorToken(
    data.nodeType,
    data.config,
    config.colorToken ?? categoryMeta.color,
    hasProviderDefaultKey,
  )
  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : config.inputPorts
  const outputPorts = Array.isArray(data.outputPorts) ? data.outputPorts : config.outputPorts
  const subtitle = data.nodeType === 'llm-model'
    ? llmConfig
      ? `${providerInfo?.name ?? llmConfig.provider} · ${llmConfig.name}`
      : '点击配置模型'
    : data.description ?? data.nodeType
  const title = data.nodeType === 'llm-model'
    ? llmConfig?.modelName ?? data.label
    : data.label

  const { setHoveredNodeId } = useCanvasActions()
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isSearchActive = useCanvasStore((s) => s.isSearchOpen && s.searchQuery.length > 0)
  const isMatch = useCanvasStore((s) => s.searchMatchIds.includes(id))
  const isCurrent = useCanvasStore((s) => s.searchMatchIds[s.currentSearchIndex] === id)

  const onMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setHoveredNodeId(id)
    }, 300)
  }, [id, setHoveredNodeId])

  const onMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoveredNodeId(null)
  }, [setHoveredNodeId])

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
    }
  }, [])

  return (
    <article
      data-testid={`canvas-node-${id}`}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'canvas-node-shell min-w-[180px] max-w-[260px] rounded-lg border bg-card text-card-foreground shadow-sm',
        selected && 'ring-2 ring-primary shadow-md',
        data.nodeType === 'llm-model' && llmState === 'unconfigured' && 'border-border/80 bg-muted/10',
        data.nodeType === 'llm-model' && llmState === 'warning' && 'border-warning/40 bg-warning/5',
        isSearchActive && isMatch && !isCurrent && 'search-match',
        isSearchActive && isCurrent && 'search-current',
        isSearchActive && !isMatch && 'search-dimmed',
      )}
      style={{ '--node-color': colorToken } as CSSProperties}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <header data-slot="header" className="border-b border-border/50 px-3 py-2">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorToken }}
          />
          <span
            className="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            style={{ borderColor: colorToken }}
          >
            {categoryMeta.label}
          </span>
          <span className="truncate text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {data.nodeType}
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {data.nodeType === 'llm-model' ? (
              llmConfig ? (
                <ProviderIcon provider={llmConfig.provider} size={15} className="shrink-0 text-foreground" />
              ) : (
                <Brain className="h-4 w-4 shrink-0 text-muted-foreground" />
              )
            ) : null}
            <h3 className="truncate text-sm font-medium leading-tight">{title}</h3>
            {data.nodeType === 'llm-model' && llmState === 'warning' ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>

      {inputPorts.length > 0 && (
        <section data-slot="inputs" className="py-1">
          {inputPorts.map((port) => (
            <div key={port.id} className="port-row relative flex h-6 items-center pl-0 pr-3">
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Left}
                isConnectable={isConnectable}
              />
              <span className="ml-3 truncate text-xs text-muted-foreground">{port.label}</span>
            </div>
          ))}
        </section>
      )}

      <div data-slot="body" className="px-3 py-2 text-xs text-muted-foreground">
        {data.nodeType === 'llm-model' ? (
          <LlmModelNodeBody config={data.config} state={llmState ?? 'unconfigured'} />
        ) : data.nodeType === 'mcp-tool' ? (
          <McpToolNodeBody data={data} />
        ) : (
          config.description
        )}
      </div>

      {outputPorts.length > 0 && (
        <section data-slot="outputs" className="py-1">
          {outputPorts.map((port) => (
            <div key={port.id} className="port-row relative flex h-6 items-center justify-end pl-3 pr-0">
              <span className="mr-3 truncate text-xs text-muted-foreground">{port.label}</span>
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Right}
                isConnectable={isConnectable}
              />
            </div>
          ))}
        </section>
      )}

      <div data-slot="state" data-state={llmState ?? 'idle'} className="sr-only">
        {llmState ?? 'idle'}
      </div>
    </article>
  )
})
