import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { buttonVariants, Button } from '@/shared/ui/button'

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
        size="icon-sm"
        onClick={onBack}
        aria-label="返回证据列表"
        data-testid="document-viewer-back"
      >
        <ArrowLeft />
      </Button>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs font-medium text-foreground" title={fileName}>
            {fileName}
          </span>
        </div>

        {locationLabel && (
          <span className="truncate text-2xs text-muted-foreground">
            {locationLabel}
          </span>
        )}
      </div>

      {contentUrl && (
        <a
          href={contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
            'shrink-0 text-muted-foreground hover:text-foreground',
          )}
          aria-label="在新标签页打开"
          data-testid="document-viewer-external"
        >
          <ExternalLink />
        </a>
      )}
    </div>
  )
}
