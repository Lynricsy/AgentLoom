import { useCallback, useRef, useState } from 'react'
import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/shared/hooks/use-theme'
import { useAuthStore } from '@/features/auth/stores/auth.store'

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: '浅色' },
  { value: 'dark', icon: Moon, label: '深色' },
  { value: 'system', icon: Monitor, label: '系统' },
]

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
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
    setOpen(false)
    await signOut()
  }, [signOut])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initial}
        </span>
        {!collapsed && (
          <span className="truncate text-left text-foreground">{displayName}</span>
        )}
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* popover */}
          <div
            className={`absolute z-50 w-56 rounded-xl border border-border bg-surface-elevated p-2 shadow-xl backdrop-blur-xl ${
              collapsed ? 'bottom-0 left-14' : 'bottom-12 left-2'
            }`}
          >
            {/* user info */}
            <div className="mb-2 border-b border-border px-2 pb-2">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              {user?.email && (
                <p className="truncate text-xs text-muted">{user.email}</p>
              )}
            </div>

            {/* theme switcher */}
            <div className="mb-2 border-b border-border pb-2">
              <p className="mb-1.5 px-2 text-xs font-medium text-muted">主题</p>
              <div className="flex gap-1 px-1">
                {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors ${
                      theme === value
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted hover:bg-surface hover:text-foreground'
                    }`}
                    title={label}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* logout */}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-error transition-colors hover:bg-error/10"
            >
              <LogOut size={14} />
              <span>退出登录</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
