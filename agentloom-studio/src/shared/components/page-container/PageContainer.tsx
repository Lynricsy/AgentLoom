import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

const WIDTH_CLASS = {
  /** 列表/仪表盘等信息密度高的页面 */
  default: 'max-w-7xl',
  /** 设置类表单页，单列阅读宽度 */
  narrow: 'max-w-4xl',
  /** 需要贴边的特殊页面 */
  full: 'max-w-none',
} as const

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof WIDTH_CLASS
}

/**
 * 文档型页面的唯一外壳。
 *
 * 迁移前存在 5 套外壳写法（`h-full p-6`、`space-y-6 px-4 py-6`、
 * `mx-auto max-w-{4xl..7xl}`、自绘 border-b 头条、玻璃卡），
 * 且同一页面的 loading / error 分支常与正常态用不同外壳，导致切换时内容跳动。
 * 页面滚动由 `__root` 的内容容器负责，这里不再自带 `overflow-y-auto`。
 */
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  function PageContainer({ className, width = 'default', ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8',
          WIDTH_CLASS[width],
          className,
        )}
        {...props}
      />
    )
  },
)
