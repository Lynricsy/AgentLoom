import { memo } from 'react'
import { Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { CanvasNode } from '../types'
import { getNodeTypeConfigOrNull } from '../nodeTypeRegistry'
import { NODE_CATEGORIES } from './nodeCategories'
import { TypedPort } from './TypedPort'

export const CanvasNodeShell = memo(function CanvasNodeShell({
  id,
  data,
  selected,
  isConnectable = true,
}: NodeProps<CanvasNode>) {
  const config = getNodeTypeConfigOrNull(data.nodeType)
  const categoryMeta = NODE_CATEGORIES[data.category]
  const colorToken = config?.colorToken ?? categoryMeta.color

  return (
    <article
      data-testid={`canvas-node-${id}`}
      className={cn(
        'canvas-node-shell rounded-lg border bg-card text-card-foreground shadow-sm',
        'min-w-[180px] max-w-[260px]',
        selected && 'ring-2 ring-primary shadow-md',
      )}
      style={{ '--node-color': colorToken } as React.CSSProperties}
    >
      <header data-slot="header" className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: colorToken }}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium leading-tight truncate">{data.label}</h3>
          <p className="text-xs text-muted-foreground truncate">
            {data.description ?? categoryMeta.label}
          </p>
        </div>
      </header>

      {data.inputPorts.length > 0 && (
        <section data-slot="inputs" className="py-1">
          {data.inputPorts.map((port) => (
            <div key={port.id} className="port-row relative flex items-center h-6 pl-0 pr-3">
              <TypedPort
                nodeId={id}
                port={port}
                position={Position.Left}
                isConnectable={isConnectable}
              />
              <span className="ml-3 text-xs text-muted-foreground truncate">{port.label}</span>
            </div>
          ))}
        </section>
      )}

      <div data-slot="body" />

      {data.outputPorts.length > 0 && (
        <section data-slot="outputs" className="py-1">
          {data.outputPorts.map((port) => (
            <div key={port.id} className="port-row relative flex items-center justify-end h-6 pl-3 pr-0">
              <span className="mr-3 text-xs text-muted-foreground truncate">{port.label}</span>
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

      <div data-slot="state" />
    </article>
  )
})
