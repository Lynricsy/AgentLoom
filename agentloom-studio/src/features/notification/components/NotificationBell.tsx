import { Bell } from 'lucide-react'
import { Badge } from '@/shared/ui/badge'
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
            <Badge
              size="sm"
              className="absolute -right-1 -top-1 min-w-5 justify-center border-transparent bg-error font-semibold text-white"
              data-testid="notification-badge"
            >
              {displayCount > 99 ? '99+' : displayCount}
            </Badge>
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
