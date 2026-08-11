import { useCallback, useState } from 'react'

export interface ControllableOpenProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * 受控/非受控开合状态。
 *
 * Radix 自身也做受控归一，但 `AnimatePresence` 需要在 React 树里显式知道
 * open 值才能驱动退场动画，因此浮层原语统一在外层再镜像一份状态，
 * 再把归一后的 `open`/`onOpenChange` 透传给 Radix Root。
 */
export function useControllableOpen({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
}: ControllableOpenProps): [boolean, (next: boolean) => void] {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  return [open, setOpen]
}
