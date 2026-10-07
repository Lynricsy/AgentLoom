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

  return (
    <Button
      variant="link"
      className={cn(
        'inline-flex h-auto min-w-0 gap-1.5 p-0 text-xs font-normal [&_svg]:size-3',
        disabled
          ? 'cursor-not-allowed text-subtle-foreground no-underline hover:no-underline'
          : 'cursor-pointer text-info hover:text-info/80',
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
      <FileText className="shrink-0" />
      <span className="truncate">{location.fileName}</span>
      {locationLabel && (
        <span className="truncate text-2xs text-muted-foreground">
          {locationLabel}
        </span>
      )}
      {!disabled && <ExternalLink className="shrink-0 opacity-60" />}
    </Button>
  )
})
