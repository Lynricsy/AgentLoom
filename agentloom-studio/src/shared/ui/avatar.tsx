import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cn } from '@/shared/lib/utils'

const SIZE_CLASS = {
  sm: 'size-6 text-2xs',
  default: 'size-8 text-xs',
  lg: 'size-10 text-sm',
} as const

export const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
    size?: keyof typeof SIZE_CLASS
  }
>(function Avatar({ className, size = 'default', ...props }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    />
  )
})

export const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn('aspect-square h-full w-full object-cover', className)}
      {...props}
    />
  )
})

export const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      className={cn(
        'flex size-full items-center justify-center bg-primary/12 font-semibold uppercase text-primary',
        className,
      )}
      {...props}
    />
  )
})
