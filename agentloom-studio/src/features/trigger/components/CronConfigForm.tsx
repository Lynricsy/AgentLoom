import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import cronstrue from 'cronstrue'
import { Label } from '@/shared/ui/label'
import { Input } from '@/shared/ui/input'
import { Select } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import type { TriggerDialogFormValues } from './TriggerCreateDialog'

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
] as const

interface CronConfigFormProps {
  register: UseFormRegister<TriggerDialogFormValues>
  watch: UseFormWatch<TriggerDialogFormValues>
  setValue: UseFormSetValue<TriggerDialogFormValues>
  errors: FieldErrors<TriggerDialogFormValues>
}

function getCronPreview(expression: string): string {
  if (!expression.trim()) {
    return '请输入 5 段 Cron 表达式，例如：0 9 * * 1-5'
  }

  try {
    return cronstrue.toString(expression.trim())
  } catch {
    return '当前表达式暂时无法解析，请检查格式。'
  }
}

export function CronConfigForm({
  register,
  watch,
  setValue,
  errors,
}: CronConfigFormProps) {
  const expression = watch('cron.expression')
  const timezone = watch('cron.timezone')
  const isEnabled = watch('isEnabled')

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor="trigger-name" className="space-y-2">
          <Label>触发器名称</Label>
          <Input id="trigger-name" placeholder="例如：工作日早报" {...register('name')} />
          {errors.name && <p className="text-xs text-error">{errors.name.message}</p>}
        </label>

        <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">启用触发器</p>
              <p className="text-xs text-muted-foreground">关闭后不再自动触发工作流。</p>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={(checked) =>
                setValue('isEnabled', checked, { shouldDirty: true, shouldValidate: true })
              }
            />
          </div>
        </div>
      </div>

      <label htmlFor="trigger-description" className="block space-y-2">
        <Label>描述</Label>
        <textarea
          id="trigger-description"
          rows={3}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          placeholder="说明这个定时触发器的用途"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-xs text-error">{errors.description.message}</p>
        )}
      </label>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <label htmlFor="cron-expression" className="space-y-2">
          <Label>Cron 表达式</Label>
          <Input
            id="cron-expression"
            placeholder="例如：0 9 * * 1-5"
            {...register('cron.expression')}
          />
          <p className="text-xs text-muted-foreground">使用 5 段格式：分 时 日 月 周</p>
          {errors.cron?.expression && (
            <p className="text-xs text-error">{errors.cron.expression.message}</p>
          )}
        </label>

        <label htmlFor="cron-timezone" className="space-y-2">
          <Label>时区</Label>
          <Select id="cron-timezone" {...register('cron.timezone')}>
            {COMMON_TIMEZONES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          {errors.cron?.timezone && (
            <p className="text-xs text-error">{errors.cron.timezone.message}</p>
          )}
        </label>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200">执行预览</p>
        <p className="mt-2 text-sm text-foreground">{getCronPreview(expression)}</p>
        <p className="mt-2 text-xs text-muted-foreground">当前时区：{timezone || 'UTC'}</p>
      </div>
    </div>
  )
}
