import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import cronstrue from 'cronstrue'
import { FormField } from '@/shared/components/form-field/FormField'
import { Input } from '@/shared/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
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
      {/* 启用开关独立成行（三种触发器表单统一），不与输入框同排拉伸 */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">启用触发器</p>
          <p className="text-xs text-muted-foreground">关闭后不再自动触发工作流。</p>
        </div>
        <Switch
          aria-label="启用触发器"
          checked={isEnabled}
          onCheckedChange={(checked) =>
            setValue('isEnabled', checked, { shouldDirty: true, shouldValidate: true })
          }
        />
      </div>

      <FormField label="触发器名称" htmlFor="trigger-name" error={errors.name?.message}>
        <Input id="trigger-name" placeholder="例如：工作日早报" {...register('name')} />
      </FormField>

      <FormField label="描述" htmlFor="trigger-description" error={errors.description?.message}>
        <Textarea
          id="trigger-description"
          rows={3}
          className="resize-none"
          placeholder="说明这个定时触发器的用途"
          {...register('description')}
        />
      </FormField>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <FormField
          label="Cron 表达式"
          htmlFor="cron-expression"
          hint="使用 5 段格式：分 时 日 月 周"
          error={errors.cron?.expression?.message}
        >
          <Input
            id="cron-expression"
            placeholder="例如：0 9 * * 1-5"
            {...register('cron.expression')}
          />
        </FormField>

        <FormField label="时区" htmlFor="cron-timezone" error={errors.cron?.timezone?.message}>
          <Select
            value={timezone}
            onValueChange={(value) =>
              setValue('cron.timezone', value, { shouldDirty: true, shouldValidate: true })
            }
          >
            <SelectTrigger id="cron-timezone" aria-label="时区">
              <SelectValue placeholder="请选择时区" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="rounded-lg border border-info/30 bg-info/10 p-4">
        <p className="text-xs font-medium tracking-wide text-info">执行预览</p>
        <p className="mt-2 text-sm text-foreground">{getCronPreview(expression)}</p>
        <p className="mt-2 text-xs text-muted-foreground">当前时区：{timezone || 'UTC'}</p>
      </div>
    </div>
  )
}
