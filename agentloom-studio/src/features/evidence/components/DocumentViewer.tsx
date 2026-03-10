import { memo, useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, FileText, Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'

import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

import { useDocumentContent } from '../api/evidenceQueries'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
} from '../stores/evidenceUiStore'

function isPdf(mimeType?: string | null): boolean {
  return mimeType === 'application/pdf'
}

function isMarkdown(mimeType?: string | null, fileName?: string | null): boolean {
  if (mimeType === 'text/markdown') return true
  return !!fileName?.endsWith('.md')
}

export const DocumentViewer = memo(function DocumentViewer({
  className,
}: {
  className?: string
}) {
  const docViewer = useEvidenceUiDocumentViewer()
  const { closeDocumentViewer } = useEvidenceUiActions()
  const [textContent, setTextContent] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const { data, isLoading, error } = useDocumentContent(
    docViewer?.knowledgeBaseId ?? undefined,
    docViewer?.documentId ?? undefined,
  )

  const contentUrl = data?.data?.url

  useEffect(() => {
    if (!contentUrl || isPdf(docViewer?.mimeType)) return

    setTextContent(null)
    setFetchError(null)

    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then(setTextContent)
      .catch((err: Error) => setFetchError(err.message))
  }, [contentUrl, docViewer?.mimeType])

  if (!docViewer) return null

  const hasKbId = !!docViewer.knowledgeBaseId

  return (
    <div
      className={cn('flex h-full flex-col', className)}
      data-testid="document-viewer"
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={closeDocumentViewer}
          data-testid="document-viewer-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {docViewer.fileName}
        </span>
        {docViewer.page != null && (
          <span className="text-[11px] text-muted-foreground">
            第 {docViewer.page} 页
          </span>
        )}
        {contentUrl && (
          <a
            href={contentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-muted-foreground transition hover:text-foreground"
            title="在新标签页打开"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {!hasKbId && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              无法加载文档预览：缺少知识库关联
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              文档 ID：{docViewer.documentId}
            </p>
          </div>
        )}

        {hasKbId && isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasKbId && error && (
          <div className="m-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
            <p className="text-xs text-rose-500">加载文档失败</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {error.message}
            </p>
          </div>
        )}

        {hasKbId && contentUrl && isPdf(docViewer.mimeType) && (
          <iframe
            src={`${contentUrl}#page=${docViewer.page ?? 1}`}
            className="h-full w-full border-0"
            title={docViewer.fileName}
            data-testid="document-viewer-pdf"
          />
        )}

        {hasKbId && textContent != null && isMarkdown(docViewer.mimeType, docViewer.fileName) && (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4" data-testid="document-viewer-markdown">
            <Markdown>{textContent}</Markdown>
          </div>
        )}

        {hasKbId && textContent != null && !isMarkdown(docViewer.mimeType, docViewer.fileName) && !isPdf(docViewer.mimeType) && (
          <pre
            className="whitespace-pre-wrap p-4 text-xs leading-6 text-foreground/85"
            data-testid="document-viewer-text"
          >
            {textContent}
          </pre>
        )}

        {hasKbId && fetchError && (
          <div className="m-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
            <p className="text-xs text-rose-500">加载文档内容失败</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fetchError}
            </p>
          </div>
        )}
      </div>
    </div>
  )
})
