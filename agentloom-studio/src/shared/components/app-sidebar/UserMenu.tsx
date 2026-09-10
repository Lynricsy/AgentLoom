import { useCallback } from 'react'
import { Check, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/shared/hooks/use-theme'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
  { value: 'system', icon: Monitor, label: '系统' },
]

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const displayName =
    (user?.user_metadata?.['display_name'] as string) ??
    (user?.user_metadata?.['full_name'] as string) ??
    user?.email ??
    '用户'
  const initial = displayName.charAt(0).toUpperCase()

  const handleSignOut = useCallback(async () => {
    await signOut()
  }, [signOut])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-2 text-muted-foreground hover:text-foreground"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {initial}
          </span>
          {collapsed ? null : (
            <span className="truncate text-left text-foreground">
              {displayName}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          {user?.email ? (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" />
              {label}
            </span>
            {theme === value ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut className="size-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
