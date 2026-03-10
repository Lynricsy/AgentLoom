import { memo } from 'react'
import { ExternalLink, FileText } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

import type { PhysicalLocation } from '../types'
import { useEvidenceUiActions } from '../stores/evidenceUiStore'

interface LocationLinkProps {
  evidenceId: string
  location: Pick<PhysicalLocation, 'documentId' | 'fileName' | 'page' | 'paragraph' | 'offset' | 'length' | 'chunkId'>
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

  const locationParts = [
    location.page != null && `第 ${location.page} 页`,
    location.paragraph != null && `第 ${location.paragraph} 段`,
  ].filter(Boolean)

  const locationLabel = locationParts.join(' · ')

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-blue-500 transition',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:text-blue-700 hover:underline',
        className,
      )}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        openFromPhysicalLocation(evidenceId, location as PhysicalLocation)
      }}
      data-testid="location-link"
    >
      <FileText className="h-3 w-3" />
      <span className="max-w-[180px] truncate">{location.fileName}</span>
      {locationLabel && (
        <span className="text-muted-foreground">({locationLabel})</span>
      )}
      {!disabled && <ExternalLink className="h-2.5 w-2.5 opacity-60" />}
    </button>
  )
})
