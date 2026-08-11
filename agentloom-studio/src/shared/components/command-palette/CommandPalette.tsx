import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/shared/hooks/use-theme'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/ui/command'
import { NAV_ITEMS_FLAT } from '@/shared/components/app-sidebar/navigation'

const THEME_OPTIONS: { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: 'light', label: '浅色主题', icon: Sun },
  { theme: 'dark', label: '深色主题', icon: Moon },
  { theme: 'system', label: '跟随系统', icon: Monitor },
]

/**
 * 全局命令面板 — Ctrl/Cmd+K 唤起。
 * 仅提供路由跳转与主题切换：后端没有全局搜索 API，不做数据检索。
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { setTheme } = useTheme()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k') return
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      setOpen((prev) => !prev)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen} label="命令面板">
      <CommandInput placeholder="跳转到页面或切换主题…" />
      <CommandList>
        <CommandEmpty>没有匹配项</CommandEmpty>

        <CommandGroup heading="前往">
          {NAV_ITEMS_FLAT.map((item) => {
            const Icon = item.icon
            return (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.to}`}
                onSelect={() => {
                  setOpen(false)
                  void navigate({ to: item.to })
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                <CommandShortcut>{item.to}</CommandShortcut>
              </CommandItem>
            )
          })}
          <CommandItem
            value="设置 /settings"
            onSelect={() => {
              setOpen(false)
              void navigate({ to: '/settings' })
            }}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span>设置</span>
            <CommandShortcut>/settings</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="主题">
          {THEME_OPTIONS.map(({ theme, label, icon: Icon }) => (
            <CommandItem
              key={theme}
              value={label}
              onSelect={() => {
                setTheme(theme)
                setOpen(false)
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
