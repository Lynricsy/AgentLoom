import { memo, useState } from 'react'
import { icons, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// Fluent Emoji 3D CDN 基础 URL
const FLUENT_EMOJI_CDN =
  'https://cdn.jsdelivr.net/npm/@lobehub/fluent-emoji-3d@latest/assets'

export interface EntityIconProps {
  /** icon 值: null 显示 fallback, "1f600" 显示 emoji, "lucide:Sparkles" 显示 lucide 图标 */
  icon: string | null | undefined
  /** 默认 fallback 图标 */
  fallback: LucideIcon
  /** 图片尺寸 (px)，默认 20 */
  size?: number
  className?: string
}

/**
 * 将 Unicode codepoint hex 字符串转为原生 emoji 字符
 * 支持组合 codepoint (如 "1f1e8-1f1f3")
 */
function codePointToNative(codepoint: string): string {
  return codepoint
    .split('-')
    .map((hex) => String.fromCodePoint(parseInt(hex, 16)))
    .join('')
}

/**
 * 通用实体图标渲染组件
 *
 * 根据 icon 值自动选择渲染方式:
 * - null/undefined: 显示 fallback lucide 图标
 * - "lucide:xxx": 显示对应 lucide 图标
 * - 其他: 当作 emoji codepoint，显示 Fluent 3D CDN 图片
 */
export const EntityIcon = memo(function EntityIcon({
  icon,
  fallback: Fallback,
  size = 20,
  className,
}: EntityIconProps) {
  // 无 icon 值，渲染默认 fallback 图标
  if (!icon) {
    return <Fallback size={size} className={cn('shrink-0', className)} />
  }

  // lucide 图标
  if (icon.startsWith('lucide:')) {
    const iconName = icon.slice(7)
    const LucideComponent = icons[iconName as keyof typeof icons]
    if (LucideComponent) {
      return <LucideComponent size={size} className={cn('shrink-0', className)} />
    }
    // lucide 图标名无效，fallback
    return <Fallback size={size} className={cn('shrink-0', className)} />
  }

  // emoji codepoint，渲染 Fluent 3D CDN 图片
  return (
    <EmojiImage
      codepoint={icon}
      size={size}
      fallbackIcon={Fallback}
      className={className}
    />
  )
})

/**
 * Emoji 图片子组件
 * CDN 加载失败时 fallback 到原生 emoji 字符
 */
const EmojiImage = memo(function EmojiImage({
  codepoint,
  size,
  fallbackIcon: FallbackIcon,
  className,
}: {
  codepoint: string
  size: number
  fallbackIcon: LucideIcon
  className?: string
}) {
  const [error, setError] = useState(false)

  if (error) {
    // CDN 加载失败，尝试渲染原生 emoji 字符
    const native = codePointToNative(codepoint)
    if (native) {
      return (
        <span
          className={cn('inline-flex shrink-0 items-center justify-center leading-none', className)}
          style={{ fontSize: size, width: size, height: size }}
          role="img"
          aria-label="emoji"
        >
          {native}
        </span>
      )
    }
    // emoji 也无效，使用 fallback 图标
    return <FallbackIcon size={size} className={cn('shrink-0', className)} />
  }

  return (
    <img
      src={`${FLUENT_EMOJI_CDN}/${codepoint}.webp`}
      alt="emoji"
      width={size}
      height={size}
      loading="lazy"
      className={cn('shrink-0 object-contain', className)}
      onError={() => setError(true)}
    />
  )
})
