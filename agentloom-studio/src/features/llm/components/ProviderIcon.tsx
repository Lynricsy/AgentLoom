import { memo, useState } from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const LOBEHUB_ICON_BASE = 'https://icons.lobehub.com/icons'

interface ProviderIconProps {
  /** Provider slug (e.g., 'openai', 'anthropic') -- used to build lobehub CDN URL */
  slug?: string
  /** @deprecated Use `slug` instead */
  provider?: string
  /** Custom icon URL -- if provided, overrides the lobehub CDN URL */
  iconUrl?: string | null
  /** Icon size in pixels (default: 20) */
  size?: number
  /** Additional CSS classes */
  className?: string
}

export const ProviderIcon = memo(function ProviderIcon({
  slug,
  provider,
  iconUrl,
  size = 20,
  className,
}: ProviderIconProps) {
  const [hasError, setHasError] = useState(false)

  const resolvedSlug = slug ?? provider ?? 'unknown'
  const src = iconUrl ?? `${LOBEHUB_ICON_BASE}/${resolvedSlug}/color.svg`

  if (hasError) {
    return <Bot size={size} className={cn('text-muted-foreground', className)} />
  }

  return (
    <img
      src={src}
      alt={resolvedSlug}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  )
})
