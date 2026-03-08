import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/utils'

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number[]
  onChange?: InputHTMLAttributes<HTMLInputElement>['onChange']
  onValueChange?: (value: number[]) => void
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { className, value, onChange, onValueChange, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="range"
      value={value[0] ?? 0}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onChange={(event) => {
        onChange?.(event)
        onValueChange?.([event.target.valueAsNumber])
      }}
      {...props}
    />
  )
})
