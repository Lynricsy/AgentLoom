import { memo, useMemo } from 'react'
import { ExternalLink, FileText } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

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

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 text-xs transition',
        disabled
          ? 'cursor-not-allowed text-muted-foreground/60'
          : 'cursor-pointer text-info hover:text-info/80 hover:underline',
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
      title={disabled ? '源文档不可用' : location.fileName}
      data-testid="location-link"
    >
      <FileText className="h-3 w-3 shrink-0" />
      <span className="truncate">{location.fileName}</span>
      {locationLabel && (
        <span className="truncate text-[10px] text-muted-foreground">
          {locationLabel}
        </span>
      )}
      {!disabled && <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />}
    </button>
  )
})
