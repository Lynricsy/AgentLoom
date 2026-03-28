import { memo, useCallback, useMemo } from 'react'
import { Plug, Loader2 } from 'lucide-react'
import { useMcpTools } from '../../api/mcpToolQueries'
import { useMcpServerConfigs } from '@/features/mcp'
import { Select } from '@/shared/ui/select'
import { buildMcpToolPorts } from '../../types/mcpToolMapping'
import type { McpToolDefinition } from '../../types/mcpToolMapping'
import type { CanvasNodeData } from '../../types'

interface McpToolConfigPanelProps {
  data: CanvasNodeData
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

export const McpToolConfigPanel = memo(function McpToolConfigPanel({
  data,
  onApply,
}: McpToolConfigPanelProps) {
  const { data: tools, isLoading: toolsLoading } = useMcpTools('mcp')
  const { data: serverConfigs, isLoading: serversLoading } = useMcpServerConfigs()

  const isLoading = toolsLoading || serversLoading

  // 只显示已激活的工具
  const activeTools = useMemo(() => {
    return (tools ?? []).filter((t) => t.isActive)
  }, [tools])

  // 构建服务器名称映射
  const serverNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const server of serverConfigs?.data ?? []) {
      map.set(server.id, server.name)
    }
    return map
  }, [serverConfigs])

  // 按服务器分组工具
  const toolGroups = useMemo(() => {
    const groups = new Map<string, { serverName: string; tools: McpToolDefinition[] }>()
    for (const tool of activeTools) {
      const serverId = tool.mcpServerConfigId ?? '_unknown'
      if (!groups.has(serverId)) {
        groups.set(serverId, {
          serverName: serverNameMap.get(serverId) ?? '未知服务器',
          tools: [],
        })
      }
      groups.get(serverId)!.tools.push(tool)
    }
    return groups
  }, [activeTools, serverNameMap])

  const currentToolId =
    typeof data.mcpToolDefinitionId === 'string' && data.mcpToolDefinitionId.length > 0
      ? data.mcpToolDefinitionId
      : ''

  const selectedTool = activeTools.find((t) => t.id === currentToolId)
  const showMissingWarning = Boolean(currentToolId) && !selectedTool && !isLoading

  const handleToolSelect = useCallback(
    (toolId: string) => {
      if (!toolId) {
        onApply({
          mcpToolDefinitionId: '',
          label: 'MCP Tool',
          description: '',
          config: {},
          inputPorts: [],
          outputPorts: [],
        })
        return
      }

      const tool = (tools ?? []).find((t) => t.id === toolId)
      if (!tool) return

      const ports = buildMcpToolPorts(tool.portMappingMetadata)
      onApply({
        mcpToolDefinitionId: tool.id,
        label: tool.title ?? tool.name,
        description: tool.description ?? '',
        config: { inputSchema: tool.inputSchema },
        inputPorts: ports.inputPorts,
        outputPorts: ports.outputPorts,
      })
    },
    [tools, onApply],
  )

  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : []

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题区域 */}
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-info" />
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
          MCP Tool
        </span>
      </div>

      {/* 工具选择 */}
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <label htmlFor="mcp-tool-select">选择工具</label>
          <span className="text-error">*</span>
        </span>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : (
          <Select
            aria-label="选择 MCP 工具"
            id="mcp-tool-select"
            value={currentToolId}
            onValueChange={handleToolSelect}
          >
            <option value="">请选择工具</option>
            {Array.from(toolGroups.entries()).map(([serverId, group]) => (
              <optgroup key={serverId} label={group.serverName}>
                {group.tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.title ?? tool.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </div>

      {/* 工具详情 */}
      {selectedTool && (
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            <p className="font-medium text-foreground">
              {selectedTool.title ?? selectedTool.name}
            </p>
            {selectedTool.description && (
              <p className="text-muted-foreground">{selectedTool.description}</p>
            )}
            <p className="break-all text-muted">ID: {selectedTool.id}</p>
          </div>

          {/* 输入端口列表 */}
          {inputPorts.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-foreground">输入端口</h4>
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
            </div>
          )}

          {/* Input Schema */}
          {selectedTool.inputSchema && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-foreground">Input Schema</h4>
              <pre className="max-h-48 overflow-auto rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
                {JSON.stringify(selectedTool.inputSchema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 工具不可用警告 */}
      {showMissingWarning && (
        <div
          className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs"
          data-testid="mcp-tool-missing-warning"
        >
          <p className="font-medium text-amber-700 dark:text-amber-300">
            当前已选择的工具不可用或已删除，请重新选择。
          </p>
          <p className="break-all text-amber-700/80 dark:text-amber-200/80">
            ID: {currentToolId}
          </p>
        </div>
      )}
    </div>
  )
})
