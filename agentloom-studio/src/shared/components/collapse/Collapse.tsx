import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/shared/lib/utils'
import { expand } from '@/shared/lib/motion'

export interface CollapseProps {
  open: boolean
  children: ReactNode
  className?: string
}

/** 高度折叠区：展开 0 → auto，收起 auto → 0，内容在退场结束后卸载 */
export function Collapse({ open, children, className }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div key="collapse" {...expand} className={cn('overflow-hidden', className)}>
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
