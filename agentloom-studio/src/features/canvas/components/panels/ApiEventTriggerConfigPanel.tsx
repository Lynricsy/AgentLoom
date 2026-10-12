import { memo, useCallback, useState, type ChangeEvent } from 'react'
import { Radio, ChevronDown } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Collapse } from '@/shared/components/collapse/Collapse'
import { FormField } from '@/shared/components/form-field/FormField'
import { cn } from '@/shared/lib/utils'

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
      <FormField
        label="事件来源"
        htmlFor="api-event-source"
        required
        hint="产生事件的系统或服务名称"
      >
        <Input
          id="api-event-source"
          type="text"
          value={parsed.eventSource}
          onChange={handleEventSourceChange}
          placeholder="例：github, stripe, internal-api"
        />
      </FormField>

      {/* 事件类型 */}
      <FormField
        label="事件类型"
        htmlFor="api-event-type"
        required
        hint="要监听的具体事件类型"
      >
        <Input
          id="api-event-type"
          type="text"
          value={parsed.eventType}
          onChange={handleEventTypeChange}
          placeholder="例：push, payment.completed, user.created"
        />
      </FormField>

      {/* 过滤表达式（可折叠） */}
      <div>
        <Button
          variant="ghost"
          size="xs"
          onClick={toggleFilter}
          aria-expanded={filterOpen}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-150',
              !filterOpen && '-rotate-90',
            )}
          />
          过滤表达式（可选）
        </Button>
        <Collapse open={filterOpen}>
          <div className="flex flex-col gap-1.5 pt-2">
            <Textarea
              id="api-event-filter"
              aria-label="过滤表达式"
              value={parsed.filterExpression}
              onChange={handleFilterExpressionChange}
              rows={4}
              placeholder={'例：event.action === "opened" && event.label === "bug"'}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              可选的 JavaScript 表达式，仅当结果为 truthy 时触发工作流
            </p>
          </div>
        </Collapse>
      </div>

      {/* 当前配置预览 */}
      <Card className="space-y-2 p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {parsed.eventSource || parsed.eventType ? (
            <>
              <span>{parsed.eventSource || '(未设置来源)'}</span>
              <span>/</span>
              <span>{parsed.eventType || '(未设置类型)'}</span>
            </>
          ) : (
            <span className="text-subtle-foreground">未配置事件来源和类型</span>
          )}
        </div>
        {parsed.filterExpression && (
          <p className="break-all font-mono text-muted-foreground">
            {parsed.filterExpression.length > 80
              ? `${parsed.filterExpression.slice(0, 80)}…`
              : parsed.filterExpression}
          </p>
        )}
      </Card>
    </div>
  )
})
