import { memo, useCallback, useState, type ChangeEvent } from 'react'
import { Radio, ChevronDown, ChevronRight } from 'lucide-react'

interface ApiEventTriggerConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface ApiEventTriggerConfig {
  eventSource: string
  eventType: string
  filterExpression: string
}

function parseApiEventTriggerConfig(config: Record<string, unknown>): ApiEventTriggerConfig {
  return {
    eventSource: typeof config.eventSource === 'string' ? config.eventSource : '',
    eventType: typeof config.eventType === 'string' ? config.eventType : '',
    filterExpression: typeof config.filterExpression === 'string' ? config.filterExpression : '',
  }
}

export const ApiEventTriggerConfigPanel = memo(function ApiEventTriggerConfigPanel({
  config,
  onApply,
}: ApiEventTriggerConfigPanelProps) {
  const parsed = parseApiEventTriggerConfig(config)
  const [filterOpen, setFilterOpen] = useState(!!parsed.filterExpression)

  const applyPatch = useCallback(
    (patch: Partial<ApiEventTriggerConfig>) => {
      const next = { ...parseApiEventTriggerConfig(config), ...patch }
      onApply({ config: next })
    },
    [config, onApply],
  )

  const handleEventSourceChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ eventSource: e.target.value })
    },
    [applyPatch],
  )

  const handleEventTypeChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ eventType: e.target.value })
    },
    [applyPatch],
  )

  const handleFilterExpressionChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      applyPatch({ filterExpression: e.target.value })
    },
    [applyPatch],
  )

  const toggleFilter = useCallback(() => {
    setFilterOpen((prev) => !prev)
  }, [])

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-warning" />
        <span className="text-xs font-medium text-foreground">API 事件触发器</span>
      </div>

      {/* 事件来源 */}
      <div>
        <label
          htmlFor="api-event-source"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          事件来源 <span className="text-error">*</span>
        </label>
        <input
          id="api-event-source"
          type="text"
          value={parsed.eventSource}
          onChange={handleEventSourceChange}
          placeholder="例：github, stripe, internal-api"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          产生事件的系统或服务名称
        </p>
      </div>

      {/* 事件类型 */}
      <div>
        <label
          htmlFor="api-event-type"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          事件类型 <span className="text-error">*</span>
        </label>
        <input
          id="api-event-type"
          type="text"
          value={parsed.eventType}
          onChange={handleEventTypeChange}
          placeholder="例：push, payment.completed, user.created"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          要监听的具体事件类型
        </p>
      </div>

      {/* 过滤表达式（可折叠） */}
      <div>
        <button
          type="button"
          onClick={toggleFilter}
          className="flex w-full items-center gap-1 text-xs font-medium text-foreground"
        >
          {filterOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          过滤表达式（可选）
        </button>
        {filterOpen && (
          <div className="mt-2">
            <textarea
              id="api-event-filter"
              value={parsed.filterExpression}
              onChange={handleFilterExpressionChange}
              rows={4}
              placeholder={'例：event.action === "opened" && event.label === "bug"'}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              可选的 JavaScript 表达式，仅当结果为 truthy 时触发工作流
            </p>
          </div>
        )}
      </div>

      {/* 当前配置预览 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {parsed.eventSource || parsed.eventType ? (
            <>
              <span>{parsed.eventSource || '(未设置来源)'}</span>
              <span>/</span>
              <span>{parsed.eventType || '(未设置类型)'}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60">未配置事件来源和类型</span>
          )}
        </div>
        {parsed.filterExpression && (
          <p className="break-all font-mono text-muted">
            {parsed.filterExpression.length > 80
              ? `${parsed.filterExpression.slice(0, 80)}...`
              : parsed.filterExpression}
          </p>
        )}
      </div>
    </div>
  )
})
