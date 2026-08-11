import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Dialog, DialogContent, DialogHiddenTitle } from './dialog'

export const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
>(function Command({ className, ...props }, ref) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-panel bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  )
})

export interface CommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 屏幕阅读器标题 */
  label: string
  children: React.ReactNode
}

export function CommandDialog({
  open,
  onOpenChange,
  label,
  children,
}: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        size="md"
        // 命令面板无描述文本，显式清空以关闭 Radix 的 aria-describedby 校验告警
        aria-describedby={undefined}
        className="max-h-[70vh] overflow-hidden p-0 sm:rounded-panel"
      >
        <DialogHiddenTitle>{label}</DialogHiddenTitle>
        <Command loop>{children}</Command>
      </DialogContent>
    </Dialog>
  )
}

export const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(function CommandInput({ className, ...props }, ref) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4">
      <Search className="h-4 w-4 shrink-0 text-muted" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  )
})

export const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(function CommandList({ className, ...props }, ref) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-80 overflow-y-auto overflow-x-hidden p-2', className)}
      {...props}
    />
  )
})

export const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(function CommandEmpty({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className={cn('py-8 text-center text-sm text-muted', className)}
      {...props}
    />
  )
})

export const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(function CommandGroup({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
})

export const CommandSeparator = forwardRef<
  ElementRef<typeof CommandPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(function CommandSeparator({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('-mx-2 my-1 h-px bg-border', className)}
      {...props}
    />
  )
})

export const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(function CommandItem({ className, ...props }, ref) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-primary/12 data-[selected=true]:text-primary data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

export function CommandShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ml-auto font-mono text-[10px] tracking-widest text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
