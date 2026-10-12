import { memo, useCallback, type ChangeEvent } from 'react'
import { Clock } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Button } from '@/shared/ui/button'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { FormField } from '@/shared/components/form-field/FormField'

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
    (value: string) => {
      applyPatch({ timezone: value })
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
      <FormField
        label="Cron 表达式"
        htmlFor="schedule-cron"
        required
        hint="标准 5 段 Cron 格式：分 时 日 月 周"
      >
        <Input
          id="schedule-cron"
          type="text"
          value={parsed.cron}
          onChange={handleCronChange}
          placeholder="例：0 * * * *"
          className="font-mono"
        />
      </FormField>

      {/* 常用预设 */}
      <div className="flex flex-col gap-1.5">
        <span id="cron-preset-label" className="text-xs font-medium text-foreground">
          常用预设
        </span>
        <div
          role="group"
          aria-labelledby="cron-preset-label"
          className="flex flex-wrap gap-2"
        >
          {CRON_PRESETS.map((preset) => {
            const selected = parsed.cron === preset.value
            return (
              <Button
                key={preset.value}
                variant={selected ? 'secondary' : 'outline'}
                size="xs"
                aria-pressed={selected}
                onClick={() => handlePresetClick(preset.value)}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* 时区 */}
      <FormField
        label="时区"
        htmlFor="schedule-timezone"
        hint="Cron 表达式将基于该时区解析执行"
      >
        <Select value={parsed.timezone} onValueChange={handleTimezoneChange}>
          <SelectTrigger id="schedule-timezone" aria-label="时区">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {/* 当前配置预览 */}
      <Card className="space-y-2 p-3 text-xs">
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
      </Card>
    </div>
  )
})
