import { Bell } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { useUnreadCount } from '../api/notificationQueries'
import {
  useIsDropdownOpen,
  useNotificationActions,
} from '../stores/notificationStore'
import { NotificationDropdown } from './NotificationDropdown'

export function NotificationBell() {
  const isDropdownOpen = useIsDropdownOpen()
  const { setDropdownOpen } = useNotificationActions()
  const { data } = useUnreadCount()

  const displayCount = data?.data.count ?? 0

  return (
    <Popover open={isDropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative rounded-full"
          aria-label="打开通知中心"
          data-testid="notification-bell"
        >
          <Bell aria-hidden="true" />

          {displayCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-2xs font-semibold leading-none text-white"
              data-testid="notification-badge"
            >
              {displayCount > 99 ? '99+' : displayCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <NotificationDropdown />
      </PopoverContent>
    </Popover>
  )
}
