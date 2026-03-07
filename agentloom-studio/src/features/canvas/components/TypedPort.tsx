import { memo } from 'react'
import { Handle, Position, useNodeConnections } from '@xyflow/react'
import { cn } from '@/shared/lib/utils'
import type { PortDefinition } from '../types/nodeTypeRegistry'
import { PORT_DATA_TYPE_META } from '../types/nodeTypeRegistry'

export interface TypedPortProps {
  nodeId: string
  port: PortDefinition
  position: Position
  isConnectable: boolean
  compatibilityState?: 'idle' | 'hover' | 'connected' | 'incompatible'
}

export const TypedPort = memo(function TypedPort({
  nodeId,
  port,
  position,
  isConnectable,
  compatibilityState,
}: TypedPortProps) {
  const handleType = port.direction === 'input' ? 'target' : 'source'
  const connections = useNodeConnections({ id: nodeId, handleId: port.id, handleType })
  const isConnected = connections.length > 0
  const resolvedState = compatibilityState ?? (isConnected ? 'connected' : 'idle')
  const meta = PORT_DATA_TYPE_META[port.dataType]

  return (
    <Handle
      id={port.id}
      type={handleType}
      position={position}
      isConnectable={isConnectable}
      className={cn(
        'typed-port',
        `typed-port-shape--${meta.shape}`,
        `typed-port-state--${resolvedState}`,
        resolvedState === 'incompatible' && 'typed-port--shake',
      )}
      style={{ '--port-color': meta.colorToken } as React.CSSProperties}
      data-testid={`port-${nodeId}-${port.id}-${port.direction}`}
      data-node-id={nodeId}
      data-port-id={port.id}
      data-port-direction={port.direction}
      data-port-type={port.dataType}
      data-port-shape={meta.shape}
      data-port-state={resolvedState}
      aria-label={`${port.direction === 'input' ? '输入端口' : '输出端口'}: ${port.label}, 类型: ${meta.label}`}
    />
  )
})
