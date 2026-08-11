import { useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Menu, Settings } from 'lucide-react'
import { NotificationBell } from '@/features/notification'
import { BrandMark } from '@/shared/components/brand'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet'
import { SidebarNav } from './SidebarNav'
import { UserMenu } from './UserMenu'

/** 小屏（<lg）顶部条：汉堡打开完整导航抽屉，右侧保留通知入口 */
export function MobileTopBar() {
  const [open, setOpen] = useState(false)
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname

  // 路由变化后收起抽屉，避免返回手势后抽屉仍然覆盖内容
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="打开导航"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
        >
          <Menu size={18} />
        </SheetTrigger>

        <SheetContent side="left" className="p-0">
          <SheetHeader className="pr-12">
            <SheetTitle className="flex items-center gap-2">
              <BrandMark size="sm" />
              AgentLoom Studio
            </SheetTitle>
            <SheetDescription>全站导航</SheetDescription>
          </SheetHeader>

          <SidebarNav
            pathname={pathname}
            onNavigate={() => setOpen(false)}
            indicatorScope="mobile"
          />

          <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
            >
              <Settings size={18} className="shrink-0" />
              <span>设置</span>
            </Link>
            <UserMenu collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      <Link to="/" className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">AgentLoom</span>
      </Link>

      <NotificationBell />
    </header>
  )
}
