import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * 排版用标签文本，渲染为 `<span>`，**不建立控件关联**。
 *
 * 仓库既有约定是把它包在原生 label 里：`<label htmlFor="x"><Label>文案</Label></label>`。
 * 表单字段请优先使用 `@/shared/ui/form` 的 `FormLabel`（渲染真正的 `<label htmlFor>`）。
 */
export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {}

export const Label = forwardRef<HTMLSpanElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn('text-xs font-medium text-foreground', className)}
      {...props}
    />
  )
})
