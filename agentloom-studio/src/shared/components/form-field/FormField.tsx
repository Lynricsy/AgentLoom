import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export interface FormFieldProps {
  label: ReactNode
  /** 关联控件 id；传入后渲染原生 <label htmlFor>，点击标签聚焦控件 */
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * 非 react-hook-form 场景的字段布局：标签 + 控件 + 提示/错误，统一间距与字号。
 * 与 `@/shared/ui/form` 的 `FormField`（RHF Controller）同名不同职，同文件都用到时请起别名导入。
 */
export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
