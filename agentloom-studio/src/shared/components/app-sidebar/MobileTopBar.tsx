import { useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Menu, Settings } from 'lucide-react'
import { useAuthToken } from '@/features/auth'
import { getInterventionPolicyRoleFromToken } from '@/features/intervention-policy'
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
import { Button } from '@/shared/ui/button'
import { NavItemLink } from './NavItemLink'
import { SidebarNav } from './SidebarNav'
import { UserMenu } from './UserMenu'

/** 小屏（<lg）顶部条：汉堡打开完整导航抽屉，右侧保留通知入口 */
export function MobileTopBar() {
  const [open, setOpen] = useState(false)
  const location = useRouterState({ select: (s) => s.location })
  const pathname = location.pathname
  const role = getInterventionPolicyRoleFromToken(useAuthToken())

  // 路由变化后收起抽屉，避免返回手势后抽屉仍然覆盖内容
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="打开导航"
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu />
          </Button>
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
            role={role}
            onNavigate={() => setOpen(false)}
            indicatorScope="mobile"
          />

          <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
            <NavItemLink
              to="/settings"
              icon={Settings}
              label="设置"
              active={pathname.startsWith('/settings')}
              onClick={() => setOpen(false)}
            />
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
