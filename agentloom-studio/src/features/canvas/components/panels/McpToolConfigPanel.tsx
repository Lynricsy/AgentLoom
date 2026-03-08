import { memo } from 'react'
import { Plug } from 'lucide-react'
import type { CanvasNodeData } from '../../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface McpToolConfigPanelProps {
  data: CanvasNodeData
}

export const McpToolConfigPanel = memo(function McpToolConfigPanel({
  data,
}: McpToolConfigPanelProps) {
  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : []
  const inputSchema = isRecord(data.config) && isRecord(data.config.inputSchema)
    ? data.config.inputSchema
    : undefined
  const toolId = typeof data.mcpToolDefinitionId === 'string' && data.mcpToolDefinitionId.length > 0
    ? data.mcpToolDefinitionId
    : null

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题区域 */}
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-info" />
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
          MCP Tool
        </span>
      </div>

      {/* 描述 */}
      {data.description && (
        <p className="text-sm text-muted-foreground">{data.description}</p>
      )}

      {/* 输入端口列表 */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-foreground">输入端口</h4>
        {inputPorts.length > 0 ? (
          <ul className="space-y-1">
            {inputPorts.map((port) => (
              <li
                key={port.id}
                className="flex items-center justify-between rounded-md bg-surface-elevated px-2 py-1 text-xs"
              >
                <span className="flex items-center gap-2 text-foreground">
                  <span>{port.label}</span>
                  {port.required && (
                    <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
                      必填
                    </span>
                  )}
                </span>
                <span className="text-muted">{port.dataType}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-surface-elevated px-3 py-2 text-xs text-muted-foreground">
            无输入参数
          </p>
        )}
      </div>

      {/* inputSchema JSON */}
      {inputSchema && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-foreground">Input Schema</h4>
          <pre className="max-h-48 overflow-auto rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
            {JSON.stringify(inputSchema, null, 2)}
          </pre>
        </div>
      )}

      {/* Tool ID */}
      {toolId && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-foreground">Tool ID</h4>
          <p className="break-all text-xs text-muted">{toolId}</p>
        </div>
      )}
    </div>
  )
})
