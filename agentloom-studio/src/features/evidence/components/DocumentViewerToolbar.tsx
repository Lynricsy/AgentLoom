import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

interface DocumentViewerToolbarProps {
  fileName: string
  contentUrl?: string | null
  locationLabel?: string | null
  onBack: () => void
  className?: string
}

export function DocumentViewerToolbar({
  fileName,
  contentUrl,
  locationLabel,
  onBack,
  className,
}: DocumentViewerToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border/60 px-3 py-2',
        className,
      )}
      data-testid="document-viewer-toolbar"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        data-testid="document-viewer-back"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs font-medium text-foreground">
            {fileName}
          </span>
        </div>

        {locationLabel && (
          <span className="text-[11px] text-muted-foreground">
            {locationLabel}
          </span>
        )}
      </div>

      {contentUrl && (
        <a
          href={contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-muted-foreground transition hover:text-foreground"
          title="在新标签页打开"
          data-testid="document-viewer-external"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}
