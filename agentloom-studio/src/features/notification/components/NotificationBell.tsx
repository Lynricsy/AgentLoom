import { useEffect, useRef, useState } from 'react'
import { cva } from 'class-variance-authority'
import { Bell } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useUnreadCount } from '../api/notificationQueries'
import {
  useIsDropdownOpen,
  useNotificationActions,
  useNotificationCount,
} from '../stores/notificationStore'
import { NotificationDropdown } from './NotificationDropdown'

const bellButtonVariants = cva(
  'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-surface/80 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
  {
    variants: {
      open: {
        true: 'bg-muted',
        false: '',
      },
    },
  },
)

function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function NotificationBell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasSyncedCount, setHasSyncedCount] = useState(false)
  const unreadCount = useNotificationCount()
  const isDropdownOpen = useIsDropdownOpen()
  const { setDropdownOpen, setUnreadCount } = useNotificationActions()
  const { data } = useUnreadCount()

  useEffect(() => {
    if (data?.data.count != null) {
      setUnreadCount(data.data.count)
      setHasSyncedCount(true)
    }
  }, [data?.data.count, setUnreadCount])

  useEffect(() => {
    if (!isDropdownOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isDropdownOpen, setDropdownOpen])

  const displayCount = hasSyncedCount ? unreadCount : (data?.data.count ?? 0)

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={cn(bellButtonVariants({ open: isDropdownOpen }))}
        onClick={() => setDropdownOpen(!isDropdownOpen)}
        aria-label="打开通知中心"
        data-testid="notification-bell"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />

        {displayCount > 0 ? (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-[10px] font-semibold leading-none text-background"
            data-testid="notification-badge"
          >
            {formatCount(displayCount)}
          </span>
        ) : null}
      </button>

      {isDropdownOpen ? <NotificationDropdown /> : null}
    </div>
  )
}
