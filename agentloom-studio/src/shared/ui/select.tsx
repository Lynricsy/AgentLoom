import {
  forwardRef,
  useCallback,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { motion } from 'motion/react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { scaleIn } from '@/shared/lib/motion'

export type SelectProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Root>

/**
 * Radix Select 的轻量包装：在原语层统一丢弃空串回吐。
 *
 * 处于 `<form>` 内时 Radix 会额外渲染一个隐藏的 `SelectBubbleInput`（原生 `<select>`）用于表单
 * 冒泡。当受控 value 变成当前尚未登记 `SelectItem` 的值时——异步回填、`reset()`、选项列表随接口
 * 返回才出现，都会命中这个时序——该隐藏 select 找不到匹配 option，便以空串触发一次 change，
 * 经由 `onValueChange('')` 回吐给调用方。放行会把刚回填的字段静默清空。
 *
 * 项目约定 `SelectItem` 禁止使用空串 value（Radix 本身也不接受），「未选择」由 `SelectValue` 的
 * placeholder 表达，因此空串永远不可能来自一次真实选择，在此一律拦下。若某个下拉需要「无 / 使用
 * 默认」这类用户可主动选回的真实选项，请用哨兵常量（如 `'__use_default__'`）承载，并在调用点把
 * 哨兵映射回 `null` / `undefined`——不要指望空串。
 */
export function Select({ onValueChange, ...props }: SelectProps) {
  const handleValueChange = useCallback(
    (value: string) => {
      if (value === '') {
        return
      }
      onValueChange?.(value)
    },
    [onValueChange],
  )

  return <SelectPrimitive.Root onValueChange={handleValueChange} {...props} />
}

export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors data-[placeholder]:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent(
  { className, children, position = 'popper', sideOffset = 4, ...props },
  ref,
) {
  // Content 必须始终挂载：关闭态下 Radix 会把 children 渲染到隐藏 fragment 里登记选项文案，
  // SelectValue 正是靠它回显当前值。若按 open 条件渲染，trigger 会一直是空白。
  // 因此出场动画交给 Radix 的即时卸载，入场动画由内部 motion.div 承担。
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        asChild
        {...props}
      >
        <motion.div
          initial={scaleIn.initial}
          animate={scaleIn.animate}
          transition={scaleIn.transition}
          className={cn(
            'relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-card border border-border bg-popover text-popover-foreground shadow-popover',
            position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
            className,
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
            <ChevronUp className="h-3.5 w-3.5" />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
            <ChevronDown className="h-3.5 w-3.5" />
          </SelectPrimitive.ScrollDownButton>
        </motion.div>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
})

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2 pr-8 text-sm text-foreground outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-primary/12 data-[highlighted]:text-primary data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
})

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
})
