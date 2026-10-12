import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Plug, Search, ArrowLeft, Server, ChevronRight, ChevronDown, Check } from 'lucide-react'
import { useMcpServerConfigs, useMcpServerConfig } from '@/features/mcp'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { buildMcpToolPorts } from '../../types/mcpToolMapping'
import type { McpToolDefinition } from '../../types/mcpToolMapping'
import type { CanvasNodeData } from '../../types'
import { Badge } from '@/shared/ui/badge'
import { motion } from 'motion/react'
import { fadeIn } from '@/shared/lib/motion'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { Skeleton } from '@/shared/ui/skeleton'

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
        <Plug className="size-4 shrink-0 text-info" />
        <Badge variant="info">MCP Server</Badge>
      </div>

      {/* 已配置展示 */}
      {showConfigured && (
        <motion.div
          key="configured"
          initial={fadeIn.initial}
          animate={fadeIn.animate}
          transition={fadeIn.transition}
          className="space-y-3"
        >
          <div className="rounded-lg border border-border bg-muted p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <Server className="mt-0.5 size-4 shrink-0 text-info" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {currentServerName || currentServerConfigId}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currentEnabledToolIds.length} / {currentTools.length} 个工具已启用
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleClear}
                className="shrink-0 font-normal text-muted-foreground hover:text-foreground"
              >
                清除
              </Button>
            </div>
          </div>

          {/* 查看工具列表 */}
          {currentTools.length > 0 && (
            <div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowToolList((v) => !v)}
                aria-expanded={showToolList}
                className="text-muted-foreground hover:text-foreground"
              >
                <ChevronDown
                  className={cn(
                    'transition-transform duration-150',
                    !showToolList && '-rotate-90',
                  )}
                />
                查看工具列表
              </Button>
              <Collapse open={showToolList}>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {currentTools.map((tool) => {
                    const isEnabled = currentEnabledToolIds.includes(tool.id)
                    return (
                      <li
                        key={tool.id}
                        className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs"
                      >
                        <div
                          className={cn(
                            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                            isEnabled
                              ? 'border-info bg-info text-white'
                              : 'border-border bg-surface',
                          )}
                        >
                          {isEnabled && <Check className="size-2.5" />}
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate text-foreground">
                            {tool.title ?? tool.name}
                          </span>
                          {tool.description && (
                            <p className="truncate text-2xs text-muted-foreground">{tool.description}</p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Collapse>
            </div>
          )}

          {/* 重新选择 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSelectServer(currentServerConfigId)}
            className="w-full font-normal"
          >
            重新选择
          </Button>
        </motion.div>
      )}

      {/* Step 1: 选择 MCP Server */}
      {!selectedServerId && !isConfigured && (
        <motion.div
          key="select-server"
          initial={fadeIn.initial}
          animate={fadeIn.animate}
          transition={fadeIn.transition}
          className="flex flex-col gap-3"
        >
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground">
            <span>选择 MCP Server</span>
            <span className="text-error">*</span>
          </span>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索 MCP Server"
              value={serverSearch}
              onChange={(e) => setServerSearch(e.target.value)}
              placeholder="搜索 MCP Server…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {serversLoading ? (
              <div role="status" className="space-y-2 p-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <span className="sr-only">加载中…</span>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                {serverSearch ? '未找到匹配的 Server' : '暂无可用 MCP Server'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredServers.map((server) => (
                  <li key={server.id}>
                    <Button
                      variant="ghost"
                      onClick={() => handleSelectServer(server.id)}
                      className="block h-auto w-full whitespace-normal rounded-none px-3 py-2.5 text-left font-normal active:scale-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Server className="size-3.5 shrink-0 text-info" />
                          <span className="truncate text-xs font-medium text-foreground">
                            {server.name}
                          </span>
                        </div>
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </div>
                      {server.description && (
                        <p className="mt-0.5 pl-5.5 text-2xs text-muted-foreground line-clamp-2">
                          {server.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 pl-5.5">
                        <Badge variant="secondary" size="sm">
                          {server.transportType}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">
                          {server.toolCount} 个工具
                        </span>
                      </div>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}

      {/* Step 2: 选择工具 */}
      {selectedServerId && (
        <motion.div
          key="select-tools"
          initial={fadeIn.initial}
          animate={fadeIn.animate}
          transition={fadeIn.transition}
          className="flex flex-col gap-3"
        >
          {/* 返回 + Server 名称 */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleBackToServers}
              className="text-muted-foreground hover:text-foreground"
              aria-label="返回服务器列表"
            >
              <ArrowLeft />
            </Button>
            <div className="flex min-w-0 items-center gap-1.5">
              <Server className="size-3.5 shrink-0 text-info" />
              <span className="truncate text-xs font-medium text-foreground">
                {selectedServerName || '加载中…'}
              </span>
            </div>
          </div>

          {/* 全选/取消全选 + 工具计数 */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {enabledToolIds.size} / {activeTools.length} 个工具已选
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleToggleAll}
              className="font-normal text-info hover:bg-info/10 hover:text-info"
            >
              {enabledToolIds.size === activeTools.length ? '取消全选' : '全选'}
            </Button>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索工具"
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="搜索工具…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* 工具复选列表 */}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {detailLoading ? (
              <div role="status" className="space-y-2 p-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <span className="sr-only">加载工具列表…</span>
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
                      <Button
                        variant="ghost"
                        onClick={() => handleToggleTool(tool.id)}
                        className={cn(
                          'h-auto w-full items-start justify-start gap-2.5 whitespace-normal rounded-none px-3 py-2.5 text-left font-normal active:scale-100 [&_svg]:size-3',
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
                          {isChecked && <Check className="size-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block break-all text-xs font-medium text-foreground">
                            {tool.title ?? tool.name}
                          </span>
                          {tool.description && (
                            <p className="mt-0.5 text-2xs text-muted-foreground line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                        </div>
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 确认按钮 */}
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={enabledToolIds.size === 0}
            className="w-full bg-info text-white hover:bg-info/90"
          >
            确认选择（{enabledToolIds.size} 个工具）
          </Button>
        </motion.div>
      )}
    </div>
  )
})
