import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Plug, Search, ArrowLeft, Server, Loader2, ChevronRight, ChevronDown, Check } from 'lucide-react'
import { useMcpServerConfigs, useMcpServerConfig } from '@/features/mcp'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { buildMcpToolPorts } from '../../types/mcpToolMapping'
import type { McpToolDefinition } from '../../types/mcpToolMapping'
import type { CanvasNodeData } from '../../types'

interface McpToolConfigPanelProps {
  data: CanvasNodeData
  onApply: (patch: Record<string, unknown>) => void
}

/**
 * MCP Server 配置面板
 * Step 1: 选择 MCP Server
 * Step 2: 查看并勾选该 Server 下的工具（默认全选）
 * 已配置: 展示已选 Server 信息 + 工具列表
 */
export const McpToolConfigPanel = memo(function McpToolConfigPanel({
  data,
  onApply,
}: McpToolConfigPanelProps) {
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [serverSearch, setServerSearch] = useState('')
  const [toolSearch, setToolSearch] = useState('')
  const [enabledToolIds, setEnabledToolIds] = useState<Set<string>>(new Set())
  const [showToolList, setShowToolList] = useState(false)

  const { data: serverConfigs, isLoading: serversLoading } = useMcpServerConfigs()

  const { data: serverDetail, isLoading: detailLoading } = useMcpServerConfig(
    selectedServerId,
    { enabled: Boolean(selectedServerId) },
  )

  const servers = useMemo(() => serverConfigs?.data ?? [], [serverConfigs])

  // 当前已配置的 server ID
  const currentServerConfigId =
    typeof data.config?.mcpServerConfigId === 'string' && data.config.mcpServerConfigId.length > 0
      ? data.config.mcpServerConfigId
      : ''
  const currentServerName =
    typeof data.config?.mcpServerName === 'string' ? data.config.mcpServerName : ''
  const currentEnabledToolIds: string[] = Array.isArray(data.config?.enabledToolIds)
    ? data.config.enabledToolIds
    : []
  const currentTools: McpToolDefinition[] = Array.isArray(data.config?.tools)
    ? data.config.tools
    : []

  const isConfigured = Boolean(currentServerConfigId)

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

  // 选择 server 后，默认全选工具
  useEffect(() => {
    if (activeTools.length > 0 && selectedServerId) {
      setEnabledToolIds(new Set(activeTools.map((t) => t.id)))
    }
  }, [activeTools, selectedServerId])

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

  const selectedServerName = useMemo(() => {
    if (selectedServerId && serverDetail) return serverDetail.name
    return servers.find((s) => s.id === selectedServerId)?.name ?? ''
  }, [selectedServerId, serverDetail, servers])

  const selectedServerDescription = useMemo(() => {
    if (selectedServerId && serverDetail) return serverDetail.description ?? ''
    return servers.find((s) => s.id === selectedServerId)?.description ?? ''
  }, [selectedServerId, serverDetail, servers])

  const handleSelectServer = useCallback((serverId: string) => {
    setSelectedServerId(serverId)
    setToolSearch('')
    setEnabledToolIds(new Set())
  }, [])

  const handleBackToServers = useCallback(() => {
    setSelectedServerId('')
    setServerSearch('')
    setEnabledToolIds(new Set())
  }, [])

  const handleToggleTool = useCallback((toolId: string) => {
    setEnabledToolIds((prev) => {
      const next = new Set(prev)
      if (next.has(toolId)) {
        next.delete(toolId)
      } else {
        next.add(toolId)
      }
      return next
    })
  }, [])

  const handleToggleAll = useCallback(() => {
    if (enabledToolIds.size === activeTools.length) {
      setEnabledToolIds(new Set())
    } else {
      setEnabledToolIds(new Set(activeTools.map((t) => t.id)))
    }
  }, [enabledToolIds.size, activeTools])

  const handleConfirm = useCallback(() => {
    const ports = buildMcpToolPorts()
    onApply({
      mcpServerConfigId: selectedServerId,
      label: selectedServerName || 'MCP Server',
      description: selectedServerDescription,
      config: {
        mcpServerConfigId: selectedServerId,
        mcpServerName: selectedServerName,
        enabledToolIds: Array.from(enabledToolIds),
        tools: activeTools,
      },
      inputPorts: ports.inputPorts,
      outputPorts: ports.outputPorts,
    })
    setSelectedServerId('')
  }, [onApply, selectedServerId, selectedServerName, selectedServerDescription, enabledToolIds, activeTools])

  const handleClear = useCallback(() => {
    onApply({
      mcpServerConfigId: '',
      label: 'MCP Tool',
      description: '',
      config: {},
      inputPorts: [],
      outputPorts: [],
    })
    setSelectedServerId('')
    setShowToolList(false)
  }, [onApply])

  // 如果不是选择流程且已配置
  const showConfigured = isConfigured && !selectedServerId

  return (
    <div className="space-y-5 px-4 py-4">
      {/* 标题区域 */}
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-info" />
        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
          MCP Server
        </span>
      </div>

      {/* 已配置展示 */}
      {showConfigured && (
        <div className="space-y-3">
          <div className="rounded-card border border-border bg-surface-elevated p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Server className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {currentServerName || currentServerConfigId}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currentEnabledToolIds.length} / {currentTools.length} 个工具已启用
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                清除
              </button>
            </div>
          </div>

          {/* 查看工具列表 */}
          {currentTools.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowToolList((v) => !v)}
                className="flex w-full items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform',
                    !showToolList && '-rotate-90',
                  )}
                />
                查看工具列表
              </button>
              {showToolList && (
                <ul className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {currentTools.map((tool) => {
                    const isEnabled = currentEnabledToolIds.includes(tool.id)
                    return (
                      <li
                        key={tool.id}
                        className="flex items-center gap-2 rounded-md bg-surface-elevated px-2 py-1.5 text-xs"
                      >
                        <div
                          className={cn(
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                            isEnabled
                              ? 'border-info bg-info text-white'
                              : 'border-border bg-surface',
                          )}
                        >
                          {isEnabled && <Check className="h-2.5 w-2.5" />}
                        </div>
                        <div className="min-w-0">
                          <span className="truncate text-foreground">{tool.title ?? tool.name}</span>
                          {tool.description && (
                            <p className="truncate text-[11px] text-muted-foreground">{tool.description}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* 重新选择 */}
          <button
            type="button"
            onClick={() => handleSelectServer(currentServerConfigId)}
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            重新选择
          </button>
        </div>
      )}

      {/* Step 1: 选择 MCP Server */}
      {!selectedServerId && !isConfigured && (
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground">
            <span>选择 MCP Server</span>
            <span className="text-error">*</span>
          </span>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索 MCP Server"
              value={serverSearch}
              onChange={(e) => setServerSearch(e.target.value)}
              placeholder="搜索 MCP Server..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-card border border-border">
            {serversLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>加载中...</span>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                {serverSearch ? '未找到匹配的 Server' : '暂无可用 MCP Server'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredServers.map((server) => (
                  <li key={server.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectServer(server.id)}
                      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server className="h-3.5 w-3.5 shrink-0 text-info" />
                          <span className="truncate text-xs font-medium text-foreground">
                            {server.name}
                          </span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </div>
                      {server.description && (
                        <p className="mt-0.5 pl-5.5 text-[11px] text-muted-foreground line-clamp-2">
                          {server.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 pl-5.5">
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {server.transportType}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
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
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              aria-label="返回服务器列表"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Server className="h-3.5 w-3.5 shrink-0 text-info" />
              <span className="truncate text-xs font-medium text-foreground">
                {selectedServerName || '加载中...'}
              </span>
            </div>
          </div>

          {/* 全选/取消全选 + 工具计数 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {enabledToolIds.size} / {activeTools.length} 个工具已选
            </span>
            <button
              type="button"
              onClick={handleToggleAll}
              className="text-xs text-info hover:text-info/80 cursor-pointer"
            >
              {enabledToolIds.size === activeTools.length ? '取消全选' : '全选'}
            </button>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索工具"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="搜索工具..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* 工具复选列表 */}
          <div className="max-h-64 overflow-y-auto rounded-card border border-border">
            {detailLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>加载工具列表...</span>
              </div>
            ) : filteredTools.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                {toolSearch ? '未找到匹配的工具' : '该 Server 暂无已激活的工具'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredTools.map((tool) => {
                  const isChecked = enabledToolIds.has(tool.id)
                  return (
                    <li key={tool.id}>
                      <button
                        type="button"
                        onClick={() => handleToggleTool(tool.id)}
                        className={cn(
                          'flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted',
                          isChecked && 'bg-info/5',
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                            isChecked
                              ? 'border-info bg-info text-white'
                              : 'border-border bg-surface',
                          )}
                        >
                          {isChecked && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-foreground">
                            {tool.title ?? tool.name}
                          </span>
                          {tool.description && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 确认按钮 */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={enabledToolIds.size === 0}
            className={cn(
              'w-full rounded-md px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
              enabledToolIds.size > 0
                ? 'bg-info text-white hover:bg-info/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            确认选择 ({enabledToolIds.size} 个工具)
          </button>
        </div>
      )}
    </div>
  )
})
