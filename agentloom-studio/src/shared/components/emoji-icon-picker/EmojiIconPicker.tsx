import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Search, Trash2, icons, type LucideIcon } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { EmojiMartData, Emoji } from '@emoji-mart/data'
import { cn } from '@/shared/lib/utils'
import { EntityIcon } from '@/shared/components/entity-icon'

// Fluent Emoji 3D CDN 基础 URL
const FLUENT_EMOJI_CDN =
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets'

// ======================================
// 类型定义
// ======================================

export interface EmojiIconPickerProps {
  /** 当前选中的 icon 值 */
  value: string | null
  /** 选中变更回调 */
  onChange: (value: string | null) => void
  /** 未选择时显示的默认图标 */
  fallbackIcon: LucideIcon
  /** 自定义 trigger 内容 */
  children?: React.ReactNode
}

type TabType = 'emoji' | 'icon'

// ======================================
// 常量
// ======================================

// Emoji 分类名称映射
const CATEGORY_NAMES: Record<string, string> = {
  people: '笑脸',
  nature: '自然',
  foods: '食物',
  activity: '活动',
  places: '旅行',
  objects: '物品',
  symbols: '符号',
  flags: '旗帜',
}

// 分类 emoji 标识（用于 tab 展示）
const CATEGORY_ICONS: Record<string, string> = {
  people: '\u{1F600}',
  nature: '\u{1F33F}',
  foods: '\u{1F354}',
  activity: '\u{26BD}',
  places: '\u{2708}\u{FE0F}',
  objects: '\u{1F4A1}',
  symbols: '\u{2764}\u{FE0F}',
  flags: '\u{1F3F3}\u{FE0F}',
}

// Emoji 网格参数
const EMOJI_COLS = 8
const EMOJI_CELL_SIZE = 40

// Lucide 常用图标列表
const POPULAR_LUCIDE_ICONS = [
  'Sparkles', 'Star', 'Heart', 'Zap', 'Flame', 'Crown', 'Diamond', 'Gem',
  'Rocket', 'Globe', 'Sun', 'Moon', 'Cloud', 'CloudLightning', 'Snowflake', 'Flower2',
  'Leaf', 'TreePine', 'Mountain', 'Waves', 'Droplets', 'Wind', 'Rainbow', 'Sunrise',
  'Bot', 'Brain', 'Cpu', 'CircuitBoard', 'Microchip', 'Wifi', 'Bluetooth', 'Radio',
  'Code', 'Terminal', 'FileCode', 'Braces', 'Bug', 'GitBranch', 'Github', 'Database',
  'Server', 'HardDrive', 'Cloud', 'Lock', 'Shield', 'Key', 'Fingerprint', 'Eye',
  'MessageSquare', 'Mail', 'Send', 'Inbox', 'Bell', 'Phone', 'Video', 'Mic',
  'Music', 'Headphones', 'Speaker', 'Volume2', 'Play', 'Pause', 'SkipForward', 'Repeat',
  'Camera', 'Image', 'Palette', 'Paintbrush', 'Pen', 'PenTool', 'Highlighter', 'Eraser',
  'FileText', 'BookOpen', 'Bookmark', 'Tag', 'Folder', 'Archive', 'Clipboard', 'StickyNote',
  'Calendar', 'Clock', 'Timer', 'Alarm', 'Hourglass', 'History', 'RotateCcw', 'RefreshCw',
  'Settings', 'Wrench', 'Hammer', 'Cog', 'SlidersHorizontal', 'ToggleLeft', 'Gauge', 'Compass',
  'Map', 'MapPin', 'Navigation', 'Plane', 'Car', 'Bike', 'Ship', 'Train',
  'Home', 'Building', 'Store', 'Landmark', 'Castle', 'Hospital', 'School', 'Factory',
  'Users', 'UserPlus', 'UserCheck', 'Contact', 'BadgeCheck', 'Award', 'Medal', 'Trophy',
  'Target', 'Crosshair', 'Flag', 'Megaphone', 'Lightbulb', 'Puzzle', 'Dices', 'Gamepad2',
  'ShoppingCart', 'CreditCard', 'Wallet', 'Banknote', 'PiggyBank', 'Receipt', 'Percent', 'TrendingUp',
  'BarChart3', 'LineChart', 'PieChart', 'Activity', 'Layers', 'LayoutGrid', 'Grid3X3', 'Boxes',
] as const

// ======================================
// 数据加载 (lazy)
// ======================================

let _emojiDataPromise: Promise<EmojiMartData> | null = null
let _emojiData: EmojiMartData | null = null

function loadEmojiData(): Promise<EmojiMartData> {
  if (_emojiData) return Promise.resolve(_emojiData)
  if (!_emojiDataPromise) {
    _emojiDataPromise = import('@emoji-mart/data').then((mod) => {
      _emojiData = mod.default as EmojiMartData
      return _emojiData
    })
  }
  return _emojiDataPromise
}

// ======================================
// 工具函数
// ======================================

/** 获取 emoji 的主 unified codepoint (小写) */
function getEmojiCodepoint(emoji: Emoji): string {
  return (emoji.skins[0]?.unified ?? '').toLowerCase()
}

/** 去重 lucide 图标列表并过滤有效图标 */
function getValidLucideIcons(): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of POPULAR_LUCIDE_ICONS) {
    if (!seen.has(name) && name in icons) {
      seen.add(name)
      result.push(name)
    }
  }
  return result
}

// ======================================
// 主组件
// ======================================

export const EmojiIconPicker = memo(function EmojiIconPicker({
  value,
  onChange,
  fallbackIcon,
  children,
}: EmojiIconPickerProps) {
  const [open, setOpen] = useState(false)

  const handleChange = useCallback(
    (val: string | null) => {
      onChange(val)
      setOpen(false)
    },
    [onChange],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {children ?? (
          <button
            type="button"
            className="flex items-center justify-center rounded-md p-1.5 transition-colors hover:bg-muted/50"
            aria-label="选择图标"
          >
            <EntityIcon icon={value} fallback={fallbackIcon} size={20} />
          </button>
        )}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-lg border border-border bg-popover shadow-lg outline-none"
          sideOffset={6}
          align="start"
          style={{ width: 352 }}
        >
          {open && (
            <PickerContent
              value={value}
              onChange={handleChange}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})

// ======================================
// Picker 内容面板
// ======================================

const PickerContent = memo(function PickerContent({
  value,
  onChange,
}: {
  value: string | null
  onChange: (val: string | null) => void
}) {
  const [tab, setTab] = useState<TabType>('emoji')

  return (
    <div className="flex flex-col" style={{ height: 380 }}>
      {/* Tab 栏 */}
      <div className="flex border-b border-border">
        <TabButton active={tab === 'emoji'} onClick={() => setTab('emoji')}>
          表情
        </TabButton>
        <TabButton active={tab === 'icon'} onClick={() => setTab('icon')}>
          图标
        </TabButton>
      </div>

      {/* Tab 内容 */}
      <div className="min-h-0 flex-1">
        {tab === 'emoji' ? (
          <EmojiTab value={value} onChange={onChange} />
        ) : (
          <IconTab value={value} onChange={onChange} />
        )}
      </div>

      {/* 移除按钮 */}
      {value && (
        <div className="border-t border-border p-2">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-error"
            onClick={() => onChange(null)}
          >
            <Trash2 size={14} />
            <span>删除图标</span>
          </button>
        </div>
      )}
    </div>
  )
})

// ======================================
// Tab 按钮
// ======================================

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex-1 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-b-2 border-primary text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// ======================================
// Emoji Tab
// ======================================

const EmojiTab = memo(function EmojiTab({
  value,
  onChange,
}: {
  value: string | null
  onChange: (val: string | null) => void
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('people')
  const [data, setData] = useState<EmojiMartData | null>(_emojiData)
  const [loading, setLoading] = useState(!_emojiData)

  // 懒加载 emoji 数据
  useEffect(() => {
    if (_emojiData) {
      setData(_emojiData)
      setLoading(false)
      return
    }
    let cancelled = false
    loadEmojiData().then((d) => {
      if (!cancelled) {
        setData(d)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  // 根据搜索和分类筛选 emoji 列表
  const emojis = useMemo(() => {
    if (!data) return []
    const query = search.trim().toLowerCase()

    if (query) {
      // 搜索模式: 遍历所有 emoji 匹配 name/keywords
      return Object.values(data.emojis).filter((emoji) => {
        if (emoji.name.toLowerCase().includes(query)) return true
        return emoji.keywords.some((kw) => kw.toLowerCase().includes(query))
      })
    }

    // 分类模式
    const cat = data.categories.find((c) => c.id === category)
    if (!cat) return []
    return cat.emojis
      .map((id) => data.emojis[id])
      .filter((e): e is Emoji => e != null)
  }, [data, search, category])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* 搜索框 */}
      <div className="p-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索表情..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      {/* 分类标签 (仅非搜索模式下显示) */}
      {!search && data && (
        <div className="flex gap-0.5 overflow-x-auto px-2 pb-1">
          {data.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={cn(
                'shrink-0 rounded-md px-1.5 py-1 text-sm transition-colors',
                category === cat.id
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => setCategory(cat.id)}
              title={CATEGORY_NAMES[cat.id] ?? cat.id}
            >
              {CATEGORY_ICONS[cat.id] ?? cat.id}
            </button>
          ))}
        </div>
      )}

      {/* Emoji 网格 (虚拟滚动) */}
      <div className="min-h-0 flex-1">
        <EmojiGrid emojis={emojis} value={value} onChange={onChange} />
      </div>
    </div>
  )
})

// ======================================
// Emoji 网格 (虚拟滚动)
// ======================================

const EmojiGrid = memo(function EmojiGrid({
  emojis,
  value,
  onChange,
}: {
  emojis: Emoji[]
  value: string | null
  onChange: (val: string | null) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = Math.ceil(emojis.length / EMOJI_COLS)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => EMOJI_CELL_SIZE,
    overscan: 3,
  })

  if (emojis.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        未找到表情
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto px-2"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * EMOJI_COLS
          const rowEmojis = emojis.slice(startIdx, startIdx + EMOJI_COLS)

          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 flex w-full"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowEmojis.map((emoji) => {
                const cp = getEmojiCodepoint(emoji)
                const isSelected = value === cp

                return (
                  <EmojiCell
                    key={emoji.id}
                    emoji={emoji}
                    codepoint={cp}
                    selected={isSelected}
                    onClick={() => onChange(cp)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ======================================
// 单个 Emoji 单元格
// ======================================

const EmojiCell = memo(function EmojiCell({
  emoji,
  codepoint,
  selected,
  onClick,
}: {
  emoji: Emoji
  codepoint: string
  selected: boolean
  onClick: () => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center rounded-md transition-colors',
        selected
          ? 'bg-primary/20 ring-1 ring-primary/40'
          : 'hover:bg-muted/60',
      )}
      style={{ width: EMOJI_CELL_SIZE, height: EMOJI_CELL_SIZE }}
      onClick={onClick}
      title={emoji.name}
    >
      {imgError ? (
        <span className="text-xl leading-none" role="img" aria-label={emoji.name}>
          {emoji.skins[0]?.native ?? ''}
        </span>
      ) : (
        <img
          src={`${FLUENT_EMOJI_CDN}/${codepoint}.webp`}
          alt={emoji.name}
          width={32}
          height={32}
          loading="lazy"
          className="object-contain"
          onError={() => setImgError(true)}
        />
      )}
    </button>
  )
})

// ======================================
// Icon Tab
// ======================================

const IconTab = memo(function IconTab({
  value,
  onChange,
}: {
  value: string | null
  onChange: (val: string | null) => void
}) {
  const [search, setSearch] = useState('')

  // 获取有效的图标列表
  const validIcons = useMemo(() => getValidLucideIcons(), [])

  // 搜索过滤
  const filteredIcons = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return validIcons
    return validIcons.filter((name) => name.toLowerCase().includes(query))
  }, [search, validIcons])

  return (
    <div className="flex h-full flex-col">
      {/* 搜索框 */}
      <div className="p-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索图标..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      {/* 图标网格 */}
      <div className="min-h-0 flex-1">
        <LucideIconGrid icons={filteredIcons} value={value} onChange={onChange} />
      </div>
    </div>
  )
})

// ======================================
// Lucide 图标网格 (虚拟滚动)
// ======================================

const ICON_COLS = 8
const ICON_CELL_SIZE = 40

const LucideIconGrid = memo(function LucideIconGrid({
  icons: iconNames,
  value,
  onChange,
}: {
  icons: string[]
  value: string | null
  onChange: (val: string | null) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const rowCount = Math.ceil(iconNames.length / ICON_COLS)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ICON_CELL_SIZE,
    overscan: 3,
  })

  if (iconNames.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        未找到图标
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-full overflow-y-auto px-2"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIdx = virtualRow.index * ICON_COLS
          const rowIcons = iconNames.slice(startIdx, startIdx + ICON_COLS)

          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 flex w-full"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rowIcons.map((iconName) => {
                const iconValue = `lucide:${iconName}`
                const isSelected = value === iconValue
                const Icon = icons[iconName as keyof typeof icons]

                if (!Icon) return null

                return (
                  <button
                    key={iconName}
                    type="button"
                    className={cn(
                      'flex items-center justify-center rounded-md transition-colors',
                      isSelected
                        ? 'bg-primary/20 ring-1 ring-primary/40'
                        : 'hover:bg-muted/60',
                    )}
                    style={{ width: ICON_CELL_SIZE, height: ICON_CELL_SIZE }}
                    onClick={() => onChange(iconValue)}
                    title={iconName}
                  >
                    <Icon size={20} />
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})
