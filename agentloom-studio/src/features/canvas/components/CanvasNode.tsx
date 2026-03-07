import { memo, useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { CanvasNode } from '../types'
import { getNodeTypeConfig } from '../types/nodeTypeRegistry'
import { NODE_CATEGORIES } from './nodeCategories'
import { TypedPort } from './TypedPort'
import { useCanvasActions, useCanvasStore } from '../stores/canvasStore'

export const CanvasNodeShell = memo(function CanvasNodeShell({
  id,
  data,
  selected,
  isConnectable = true,
}: NodeProps<CanvasNode>) {
  const config = getNodeTypeConfig(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[data.category]
  const colorToken = config.colorToken ?? categoryMeta.color
  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : config.inputPorts
  const outputPorts = Array.isArray(data.outputPorts) ? data.outputPorts : config.outputPorts
  const subtitle = data.description ?? data.nodeType

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
          <h3 className="truncate text-sm font-medium leading-tight">{data.label}</h3>
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
        {config.description}
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

      <div data-slot="state" data-state="idle" className="sr-only">
        idle
      </div>
    </article>
  )
})
