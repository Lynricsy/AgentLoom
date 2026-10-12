import { memo, useMemo } from 'react'
import { ExternalLink, FileText } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

import type { PhysicalLocation } from '../types'
import { useEvidenceUiActions } from '../stores/evidenceUiStore'

interface LocationLinkProps {
  evidenceId: string
  location: PhysicalLocation
  disabled?: boolean
  className?: string
}

export const LocationLink = memo(function LocationLink({
  evidenceId,
  location,
  disabled,
  className,
}: LocationLinkProps) {
  const { openFromPhysicalLocation } = useEvidenceUiActions()

  const locationLabel = useMemo(() => {
    const parts: string[] = []

    if (location.page != null) {
      parts.push(`第 ${location.page} 页`)
    }

    if (location.paragraph != null) {
      parts.push(`第 ${location.paragraph} 段`)
    }

    return parts.join(' · ')
  }, [location.page, location.paragraph])

  // Button 基类 shrink-0 + whitespace-nowrap：这里允许收缩，长文件名才能在 flex-wrap 底栏里截断；
  // disabled 时 pointer-events-none 会吞掉按钮自身的 title，原因放在外层 span 上
  return (
    <span
      className="inline-flex min-w-0 max-w-full"
      title={disabled ? '源文档不可用' : location.fileName}
    >
      <Button
        variant="link"
        className={cn(
          'inline-flex h-auto min-w-0 max-w-full shrink gap-1.5 p-0 text-xs font-normal [&_svg]:size-3',
          disabled
            ? 'text-subtle-foreground no-underline hover:no-underline'
            : 'text-info hover:text-info/80',
          className,
        )}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          if (disabled) {
            return
          }

          openFromPhysicalLocation(evidenceId, location)
        }}
        data-testid="location-link"
      >
        <FileText className="shrink-0" />
        <span className="min-w-0 truncate">{location.fileName}</span>
        {locationLabel && (
          <span className="shrink-0 text-2xs text-muted-foreground">
            {locationLabel}
          </span>
        )}
        {!disabled && <ExternalLink className="shrink-0 opacity-60" />}
      </Button>
    </span>
  )
})
