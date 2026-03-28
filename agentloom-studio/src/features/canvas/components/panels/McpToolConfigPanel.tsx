import { memo, useCallback, useMemo, useState } from 'react'
import { Plug, Search, Check, ArrowLeft, Server, Loader2, ChevronRight } from 'lucide-react'
import { useMcpServerConfigs, useMcpServerConfig } from '@/features/mcp'
import { cn } from '@/shared/lib/utils'
import { buildMcpToolPorts } from '../../types/mcpToolMapping'
import type { McpToolDefinition } from '../../types/mcpToolMapping'
import type { CanvasNodeData } from '../../types'

interface McpToolConfigPanelProps {
  data: CanvasNodeData
  onApply: (patch: Record<string, unknown>) => void
}

/**
 * MCP Tool 两步配置面板
 * Step 1: 选择 MCP Server
 * Step 2: 选择该 Server 下的工具
 */
export const McpToolConfigPanel = memo(function McpToolConfigPanel({
  data,
  onApply,
}: McpToolConfigPanelProps) {
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [serverSearch, setServerSearch] = useState('')
  const [toolSearch, setToolSearch] = useState('')

  // 获取所有 MCP Server 列表
  const { data: serverConfigs, isLoading: serversLoading } = useMcpServerConfigs()

  // 获取选中 Server 的详情（含工具列表）
  const { data: serverDetail, isLoading: detailLoading } = useMcpServerConfig(
    selectedServerId,
    { enabled: Boolean(selectedServerId) },
  )

  const servers = useMemo(() => serverConfigs?.data ?? [], [serverConfigs])

  // 按搜索过滤服务器
  const filteredServers = useMemo(() => {
    if (!serverSearch.trim()) return servers
    const query = serverSearch.trim().toLowerCase()
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.description ?? '').toLowerCase().includes(query),
    )
  }, [servers, serverSearch])

  // 从 Server 详情获取激活的工具
  const activeTools = useMemo(() => {
    return (serverDetail?.tools ?? []).filter((t) => t.isActive)
  }, [serverDetail])

  // 按搜索过滤工具
  const filteredTools = useMemo(() => {
    if (!toolSearch.trim()) return activeTools
    const query = toolSearch.trim().toLowerCase()
    return activeTools.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        (t.title ?? '').toLowerCase().includes(query) ||
        (t.description ?? '').toLowerCase().includes(query),
    )
  }, [activeTools, toolSearch])

  // 当前已选工具信息
  const currentToolId =
    typeof data.mcpToolDefinitionId === 'string' && data.mcpToolDefinitionId.length > 0
      ? data.mcpToolDefinitionId
      : ''

  // 当前已选 server 名称（从 config 中读取）
  const currentServerName =
    typeof data.config?.mcpServerName === 'string' ? data.config.mcpServerName : ''

  const selectedServerName = useMemo(() => {
    if (selectedServerId && serverDetail) return serverDetail.name
    return servers.find((s) => s.id === selectedServerId)?.name ?? ''
  }, [selectedServerId, serverDetail, servers])

  const handleSelectServer = useCallback((serverId: string) => {
    setSelectedServerId(serverId)
    setToolSearch('')
  }, [])

  const handleBackToServers = useCallback(() => {
    setSelectedServerId('')
    setServerSearch('')
  }, [])

  const handleSelectTool = useCallback(
    (tool: McpToolDefinition) => {
      const ports = buildMcpToolPorts()
      onApply({
        mcpToolDefinitionId: tool.id,
        label: tool.title ?? tool.name,
        description: tool.description ?? '',
        config: {
          inputSchema: tool.inputSchema,
          mcpServerConfigId: selectedServerId || tool.mcpServerConfigId,
          mcpServerName: selectedServerName || currentServerName,
        },
        inputPorts: ports.inputPorts,
        outputPorts: ports.outputPorts,
      })
    },
    [onApply, selectedServerId, selectedServerName, currentServerName],
  )

  const handleClear = useCallback(() => {
    onApply({
      mcpToolDefinitionId: '',
      label: 'MCP Tool',
      description: '',
      config: {},
      inputPorts: [],
      outputPorts: [],
    })
    setSelectedServerId('')
  }, [onApply])

  const inputPorts = Array.isArray(data.inputPorts) ? data.inputPorts : []

  // 已选工具详情（从 activeTools 或通过 ID 匹配）
  const selectedTool = useMemo(() => {
    if (!currentToolId) return null
    return activeTools.find((t) => t.id === currentToolId) ?? null
  }, [currentToolId, activeTools])

  return (
    <div className="space-y-4 px-4 py-4">
      {/* 标题区域 */}
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-info" />
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
          MCP Tool
        </span>
      </div>

      {/* 已选工具展示 */}
      {currentToolId && (
        <div className="space-y-3">
          <div className="rounded-md border border-neutral-700 bg-neutral-800/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Plug className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div className="min-w-0">
                  {currentServerName && (
                    <p className="text-[11px] text-neutral-400 mb-0.5">
                      {currentServerName}
                    </p>
                  )}
                  <p className="text-sm font-medium text-neutral-200 truncate">
                    {data.label || currentToolId}
                  </p>
                  {data.description && (
                    <p className="mt-1 text-xs text-neutral-400 line-clamp-3">
                      {data.description}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer"
              >
                清除
              </button>
            </div>
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
          {selectedTool?.inputSchema && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-foreground">Input Schema</h4>
              <pre className="max-h-48 overflow-auto rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
                {JSON.stringify(selectedTool.inputSchema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Step 1: 选择 MCP Server */}
      {!selectedServerId && (
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <label>选择 MCP Server</label>
            <span className="text-error">*</span>
          </span>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={serverSearch}
              onChange={(e) => setServerSearch(e.target.value)}
              placeholder="搜索 MCP Server..."
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-info/50"
            />
          </div>

          {/* Server 列表 */}
          <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-700">
            {serversLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>加载中...</span>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
                {serverSearch ? '未找到匹配的 Server' : '暂无可用 MCP Server'}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-700/50">
                {filteredServers.map((server) => (
                  <li key={server.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectServer(server.id)}
                      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server className="h-3.5 w-3.5 shrink-0 text-info" />
                          <span className="truncate text-xs font-medium text-neutral-200">
                            {server.name}
                          </span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                      </div>
                      {server.description && (
                        <p className="mt-0.5 pl-5.5 text-[11px] text-neutral-500 line-clamp-2">
                          {server.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 pl-5.5">
                        <span className="rounded-full bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-400">
                          {server.transportType}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          {server.toolCount} 个工具
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Step 2: 选择工具 */}
      {selectedServerId && (
        <div className="flex flex-col gap-3">
          {/* 返回 + Server 名称 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackToServers}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-200 cursor-pointer"
              aria-label="返回服务器列表"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Server className="h-3.5 w-3.5 shrink-0 text-info" />
              <span className="truncate text-xs font-medium text-neutral-200">
                {selectedServerName || '加载中...'}
              </span>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <label>选择工具</label>
            <span className="text-error">*</span>
          </span>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="搜索工具..."
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 py-1.5 pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-info/50"
            />
          </div>

          {/* 工具列表 */}
          <div className="max-h-64 overflow-y-auto rounded-md border border-neutral-700">
            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>加载工具列表...</span>
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-neutral-500">
                {toolSearch ? '未找到匹配的工具' : '该 Server 暂无已激活的工具'}
              </div>
            ) : (
              <ul className="divide-y divide-neutral-700/50">
                {filteredTools.map((tool) => {
                  const isSelected = tool.id === currentToolId
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectTool(tool)}
                        className={cn(
                          'w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/30',
                          isSelected && 'bg-info/10',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium text-neutral-200">
                            {tool.title ?? tool.name}
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-info" />
                          )}
                        </div>
                        {tool.description && (
                          <p className="mt-0.5 text-[11px] text-neutral-500 line-clamp-2">
                            {tool.description}
                          </p>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 工具不可用警告 */}
      {Boolean(currentToolId) && !selectedTool && !detailLoading && !serversLoading && (
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
