import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Switch } from '@/shared/ui/switch'

/** 表单字段：统一 label 与控件的间距、字号 */
export function Field({
  htmlFor,
  label,
  className,
  children,
}: {
  htmlFor: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-xs font-medium text-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

/** 元数据小格：统一 label / value 的字号与间距 */
export function MetaTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-1.5 break-all text-xs font-medium text-foreground">{value}</div>
    </div>
  )
}

/** 开关卡：Switch 与说明文案的统一排版 */
export function ToggleTile({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Switch checked={checked} aria-label={title} onCheckedChange={onCheckedChange} />
    </div>
  )
}

/** 受管密钥状态：只展示「是否已配置」，永不回显明文或 secret ref */
export function SecretStatusBlock({
  title,
  configured,
  description,
}: {
  title: string
  configured: boolean
  description: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Badge variant={configured ? 'success' : 'secondary'} size="sm">
        {configured ? '已配置受管密钥' : '未配置'}
      </Badge>
    </div>
  )
}
