/**
 * 节点面板共享视觉件 — workflow (`NodePalette`) 与 agent (`AgentNodePalette`) 共用同一套外观。
 *
 * 这里只负责渲染：图标解析、类别色芯片、分组头、条目按钮、折叠态图标列以及拖拽缩影。
 * 面板的数据来源（静态注册表 / 插件 / 可复用块 / MCP）与过滤逻辑各自保留在调用方。
 */

import { memo, type DragEvent, type ReactNode } from 'react'
import {
  ArrowRightFromLine,
  BookOpen,
  BookOpenText,
  Bot,
  Box,
  Braces,
  Brain,
  BrainCircuit,
  ChevronDown,
  CircleOff,
  Clock,
  Code,
  Container,
  Database,
  FastForward,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  GitFork,
  GitMerge,
  Globe,
  Package,
  Play,
  Plug,
  Puzzle,
  Radio,
  RefreshCcw,
  Repeat,
  Webhook,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { TooltipHint } from '@/shared/ui/tooltip'

/** 注册表 `icon` 字段（字符串）到 lucide 组件的映射 */
const PALETTE_ICONS: Record<string, LucideIcon> = {
  ArrowRightFromLine,
  BookOpen,
  BookOpenText,
  Bot,
  Box,
  Braces,
  Brain,
  BrainCircuit,
  CircleOff,
  Clock,
  Code,
  Container,
  Database,
  FastForward,
  FileText,
  Filter,
  FolderOpen,
  GitBranch,
  GitFork,
  GitMerge,
  Globe,
  Package,
  Play,
  Plug,
  Puzzle,
  Radio,
  RefreshCcw,
  Repeat,
  Webhook,
  Wrench,
  Zap,
}

/** 面板外壳（宽度由调用方按展开/折叠态给出） */
export const PALETTE_SHELL_CLASS =
  'flex h-full flex-col border-r border-border bg-surface'

interface PaletteIconChipProps {
  icon: string
  /** 类别色，形如 `var(--color-node-agent)` */
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const CHIP_SIZE_CLASS: Record<NonNullable<PaletteIconChipProps['size']>, string> = {
  sm: 'h-5 w-5 rounded-md',
  md: 'h-7 w-7 rounded-lg',
  lg: 'h-8 w-8 rounded-lg',
}

const CHIP_ICON_CLASS: Record<NonNullable<PaletteIconChipProps['size']>, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
}

/** 类别色图标芯片 — 与画布节点头部芯片同源视觉 */
export const PaletteIconChip = memo(function PaletteIconChip({
  icon,
  color,
  size = 'md',
  className,
}: PaletteIconChipProps) {
  const Icon = PALETTE_ICONS[icon] ?? Box

  return (
    <span
      aria-hidden
      data-palette-chip
      className={cn(
        'inline-flex shrink-0 items-center justify-center border',
        CHIP_SIZE_CLASS[size],
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 26%, transparent)`,
      }}
    >
      <Icon className={CHIP_ICON_CLASS[size]} />
    </span>
  )
})

interface PaletteSectionHeaderProps {
  icon: string
  color: string
  label: string
  isCollapsed: boolean
  onToggle: () => void
}

/** 分组头 — 点击折叠/展开；`.flex-1.text-left` 是既有测试的定位锚点，勿移除 */
export const PaletteSectionHeader = memo(function PaletteSectionHeader({
  icon,
  color,
  label,
  isCollapsed,
  onToggle,
}: PaletteSectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-elevated"
    >
      <PaletteIconChip icon={icon} color={color} size="sm" />
      <span className="flex-1 text-left text-xs font-semibold tracking-wide">
        {label}
      </span>
      <ChevronDown
        aria-hidden
        className={cn(
          'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
          isCollapsed && '-rotate-90',
        )}
      />
    </button>
  )
})

interface PaletteItemButtonProps {
  icon: string
  color: string
  label: string
  description?: string
  /** 不可拖拽（如 agent 画布自动创建的单例节点） */
  disabled?: boolean
  /** 标题右侧的补充标记 */
  badge?: ReactNode
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
}

/** 面板条目 — 类别色芯片 + 名称 + 描述 */
export const PaletteItemButton = memo(function PaletteItemButton({
  icon,
  color,
  label,
  description,
  disabled = false,
  badge,
  onDragStart,
}: PaletteItemButtonProps) {
  return (
    <button
      type="button"
      draggable={!disabled}
      onDragStart={onDragStart}
      title={description}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition-colors',
        disabled
          ? 'cursor-default opacity-55'
          : 'cursor-grab hover:border-border hover:bg-surface-elevated active:cursor-grabbing',
      )}
    >
      <PaletteIconChip icon={icon} color={color} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-xs font-medium',
              disabled ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {label}
          </span>
          {badge}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
})

interface PaletteRailItemProps {
  icon: string
  color: string
  label: string
  description?: string
  disabled?: boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
}

/** 折叠态图标列条目 — 只显芯片，名称走 tooltip */
export const PaletteRailItem = memo(function PaletteRailItem({
  icon,
  color,
  label,
  description,
  disabled = false,
  onDragStart,
}: PaletteRailItemProps) {
  return (
    <TooltipHint
      side="right"
      label={
        <span className="block max-w-[200px]">
          <span className="block font-medium text-foreground">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-muted-foreground">{description}</span>
          ) : null}
        </span>
      }
    >
      <button
        type="button"
        draggable={!disabled}
        onDragStart={onDragStart}
        aria-label={label}
        className={cn(
          'flex items-center justify-center rounded-lg border border-transparent p-1 transition-colors',
          disabled
            ? 'cursor-default opacity-55'
            : 'cursor-grab hover:border-border hover:bg-surface-elevated active:cursor-grabbing',
        )}
      >
        <PaletteIconChip icon={icon} color={color} size="lg" />
      </button>
    </TooltipHint>
  )
})

/**
 * 拖拽缩影 — 用节点卡外观（类别色边框 + 芯片 + 名称）替换浏览器默认的按钮截图。
 * 芯片直接克隆条目里已渲染的 DOM，保证图标与颜色和面板一致。
 */
export function applyPaletteDragPreview(
  event: DragEvent<HTMLElement>,
  { label, color }: { label: string; color: string },
): void {
  const dataTransfer = event.dataTransfer

  if (typeof document === 'undefined' || typeof dataTransfer?.setDragImage !== 'function') {
    return
  }

  const card = document.createElement('div')
  card.className =
    'pointer-events-none flex w-[188px] items-center gap-2 rounded-card border bg-surface px-3 py-2 shadow-node'
  card.style.position = 'fixed'
  card.style.top = '-1000px'
  card.style.left = '-1000px'
  card.style.borderColor = `color-mix(in srgb, ${color} 35%, var(--color-border))`

  const chip = event.currentTarget.querySelector('[data-palette-chip]')
  if (chip) {
    card.appendChild(chip.cloneNode(true))
  }

  const title = document.createElement('span')
  title.className = 'truncate text-xs font-medium text-foreground'
  title.textContent = label
  card.appendChild(title)

  document.body.appendChild(card)
  dataTransfer.setDragImage(card, 16, 16)

  // 缩影必须存活到拖拽结束，浏览器才会持续使用它作为拖拽图像
  event.currentTarget.addEventListener('dragend', () => card.remove(), { once: true })
}
