import { memo, useCallback, type ChangeEvent } from 'react'
import { Clock } from 'lucide-react'

interface ScheduleTriggerConfigPanelProps {
  config: Record<string, unknown>
  onApply: (patch: Record<string, unknown>) => void
}

interface ScheduleTriggerConfig {
  cron: string
  timezone: string
}

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: '每分钟', value: '* * * * *' },
  { label: '每小时', value: '0 * * * *' },
  { label: '每天 0:00', value: '0 0 * * *' },
  { label: '每周一 0:00', value: '0 0 * * 1' },
]

const COMMON_TIMEZONES: string[] = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
]

function parseScheduleTriggerConfig(config: Record<string, unknown>): ScheduleTriggerConfig {
  return {
    cron: typeof config.cron === 'string' ? config.cron : '',
    timezone: typeof config.timezone === 'string' ? config.timezone : 'UTC',
  }
}

export const ScheduleTriggerConfigPanel = memo(function ScheduleTriggerConfigPanel({
  config,
  onApply,
}: ScheduleTriggerConfigPanelProps) {
  const parsed = parseScheduleTriggerConfig(config)

  const applyPatch = useCallback(
    (patch: Partial<ScheduleTriggerConfig>) => {
      const next = { ...parseScheduleTriggerConfig(config), ...patch }
      onApply({ config: next })
    },
    [config, onApply],
  )

  const handleCronChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      applyPatch({ cron: e.target.value })
    },
    [applyPatch],
  )

  const handleTimezoneChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      applyPatch({ timezone: e.target.value })
    },
    [applyPatch],
  )

  const handlePresetClick = useCallback(
    (value: string) => {
      applyPatch({ cron: value })
    },
    [applyPatch],
  )

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-warning" />
        <span className="text-xs font-medium text-foreground">定时触发器</span>
      </div>

      {/* Cron 表达式 */}
      <div>
        <label
          htmlFor="schedule-cron"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          Cron 表达式 <span className="text-error">*</span>
        </label>
        <input
          id="schedule-cron"
          type="text"
          value={parsed.cron}
          onChange={handleCronChange}
          placeholder="例：0 * * * *"
          className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          标准 5 段 Cron 格式：分 时 日 月 周
        </p>
      </div>

      {/* 常用预设 */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">
          常用预设
        </label>
        <div className="flex flex-wrap gap-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handlePresetClick(preset.value)}
              className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                parsed.cron === preset.value
                  ? 'border-warning/50 bg-warning/10 text-warning'
                  : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 时区 */}
      <div>
        <label
          htmlFor="schedule-timezone"
          className="mb-2 block text-xs font-medium text-foreground"
        >
          时区
        </label>
        <select
          id="schedule-timezone"
          value={parsed.timezone}
          onChange={handleTimezoneChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Cron 表达式将基于该时区解析执行
        </p>
      </div>

      {/* 当前配置预览 */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <p className="font-medium text-foreground">当前配置</p>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {parsed.cron ? (
            <>
              <span className="font-mono">{parsed.cron}</span>
              <span>&middot;</span>
              <span>{parsed.timezone}</span>
            </>
          ) : (
            <span className="text-muted-foreground/60">未配置 Cron 表达式</span>
          )}
        </div>
      </div>
    </div>
  )
})
