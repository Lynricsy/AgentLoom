import {
  memo,
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Loader2 } from 'lucide-react'
import parse from 'html-react-parser'
import MarkdownIt from 'markdown-it'
import { Document, Page, pdfjs } from 'react-pdf'

import { cn } from '@/shared/lib/utils'

import { useDocumentContent } from '../api/evidenceQueries'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
} from '../stores/evidenceUiStore'

import { DocumentViewerToolbar } from './DocumentViewerToolbar'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

type PageProps = ComponentProps<typeof Page>
type PdfTextRendererArgs = Parameters<
  NonNullable<PageProps['customTextRenderer']>
>[0]
type PdfTextSuccessArgs = Parameters<NonNullable<PageProps['onGetTextSuccess']>>[0]

interface PdfTextOffset {
  start: number
  end: number
}

interface PdfTextItemLike {
  str: string
  hasEOL?: boolean
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function isPdfTextItemLike(value: unknown): value is PdfTextItemLike {
  if (typeof value !== 'object' || value == null) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.str === 'string' &&
    (record.hasEOL == null || typeof record.hasEOL === 'boolean')
  )
}

function getPdfTextItems(textContent: PdfTextSuccessArgs): PdfTextItemLike[] {
  if (typeof textContent !== 'object' || textContent == null) {
    return []
  }

  const items = (textContent as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return []
  }

  return items.filter(isPdfTextItemLike)
}

function isPdf(mimeType?: string | null, fileName?: string | null): boolean {
  if (mimeType === 'application/pdf') {
    return true
  }

  return !!fileName?.toLowerCase().endsWith('.pdf')
}

function isMarkdown(mimeType?: string | null, fileName?: string | null): boolean {
  if (mimeType === 'text/markdown') return true
  return !!fileName?.toLowerCase().endsWith('.md')
}

function unwrapMark(mark: HTMLElement) {
  const parent = mark.parentNode
  if (!parent) return

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }

  parent.removeChild(mark)
  if (parent instanceof HTMLElement) {
    parent.normalize()
  }
}

function clearEvidenceHighlights(container: HTMLElement) {
  container
    .querySelectorAll('mark[data-evidence-highlight="true"]')
    .forEach((mark) => {
      if (mark instanceof HTMLElement) {
        unwrapMark(mark)
      }
    })

  container
    .querySelectorAll('[data-evidence-paragraph-highlight="true"]')
    .forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      el.removeAttribute('data-evidence-paragraph-highlight')
      el.classList.remove(
        'bg-highlight/10',
        'ring-1',
        'ring-highlight/50',
        'rounded-md',
      )
    })
}

function highlightTextRangeInElement(
  container: HTMLElement,
  offset: number,
  length: number,
): HTMLElement | null {
  if (length <= 0) {
    return null
  }

  const start = Math.max(0, offset)
  const end = start + length

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  )

  let currentNode = walker.nextNode() as Text | null
  let cursor = 0

  let startNode: Text | null = null
  let endNode: Text | null = null
  let startOffset = 0
  let endOffset = 0

  while (currentNode) {
    const textLength = currentNode.nodeValue?.length ?? 0
    const nextCursor = cursor + textLength

    if (startNode == null && start <= nextCursor) {
      startNode = currentNode
      startOffset = Math.max(0, start - cursor)
    }

    if (startNode != null && end <= nextCursor) {
      endNode = currentNode
      endOffset = Math.max(0, end - cursor)
      break
    }

    cursor = nextCursor
    currentNode = walker.nextNode() as Text | null
  }

  if (!startNode || !endNode) {
    return null
  }

  try {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)

    const mark = document.createElement('mark')
    mark.dataset.evidenceHighlight = 'true'
    mark.className = 'rounded bg-highlight/40 px-0.5'

    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)

    return mark
  } catch {
    return null
  }
}

function findParagraphElement(container: HTMLElement, paragraph?: number | null) {
  if (paragraph == null) {
    return null
  }

  const candidate = container.querySelector(
    `[data-paragraph-index="${paragraph}"]`,
  )
  if (candidate instanceof HTMLElement) {
    return candidate
  }

  const oneBased = container.querySelector(
    `[data-paragraph-index="${paragraph - 1}"]`,
  )
  return oneBased instanceof HTMLElement ? oneBased : null
}

export const DocumentViewer = memo(function DocumentViewer({
  className,
}: {
  className?: string
}) {
  const docViewer = useEvidenceUiDocumentViewer()
  const { closeDocumentViewer } = useEvidenceUiActions()

  const [rawText, setRawText] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [textHighlightActive, setTextHighlightActive] = useState(false)
  const [pdfHighlightActive, setPdfHighlightActive] = useState(false)
  const [pdfTextOffsets, setPdfTextOffsets] = useState<PdfTextOffset[]>([])
  const [pdfTextLayerVersion, setPdfTextLayerVersion] = useState(0)

  const markdownContainerRef = useRef<HTMLDivElement | null>(null)
  const pdfContainerRef = useRef<HTMLDivElement | null>(null)
  const textHighlightRef = useRef<HTMLElement | null>(null)

  const knowledgeBaseId = docViewer?.knowledgeBaseId ?? null
  const documentId = docViewer?.documentId ?? null
  const location = docViewer?.physicalLocation ?? null

  const locationPage = location?.page ?? null
  const locationParagraph = location?.paragraph ?? null
  const locationOffset = location?.offset ?? null
  const locationLength = location?.length ?? null

  const { data, isLoading, error } = useDocumentContent(
    knowledgeBaseId ?? undefined,
    documentId ?? undefined,
  )

  const contentUrl = data?.data?.url ?? null
  const contentFileName = data?.data?.fileName
  const contentMimeType = data?.data?.mimeType

  const hasKbId = !!knowledgeBaseId
  const fileName =
    docViewer?.fileName ?? contentFileName ?? documentId ?? 'unknown-document'
  const mimeType = docViewer?.mimeType ?? contentMimeType

  const kind = useMemo(() => {
    if (isPdf(mimeType, fileName)) {
      return 'pdf'
    }

    if (isMarkdown(mimeType, fileName)) {
      return 'markdown'
    }

    return 'text'
  }, [fileName, mimeType])

  const locationLabel = useMemo(() => {
    if (!location) {
      return null
    }

    const parts: string[] = []
    if (location.page != null) {
      parts.push(`第 ${location.page} 页`)
    }
    if (location.paragraph != null) {
      parts.push(`段落 ${location.paragraph}`)
    }
    if (location.chunkId) {
      parts.push(`Chunk ${location.chunkId}`)
    }

    return parts.length > 0 ? parts.join(' · ') : null
  }, [location])

  const pdfHighlightRange = useMemo(() => {
    if (kind !== 'pdf' || locationOffset == null || locationLength == null) {
      return null
    }

    const start = Math.max(0, locationOffset)
    const end = Math.max(start, locationOffset + locationLength)
    return end > start ? { start, end } : null
  }, [kind, locationLength, locationOffset])

  const markdownIt = useMemo(() => {
    const md = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
    })

    md.renderer.rules.paragraph_open = (tokens, idx, options, env, self) => {
      const typedEnv = env as { paragraphIndex?: number }
      const paragraphIndex = typedEnv.paragraphIndex ?? 0
      typedEnv.paragraphIndex = paragraphIndex + 1

      tokens[idx]?.attrSet('data-paragraph-index', String(paragraphIndex))
      return self.renderToken(tokens, idx, options)
    }

    return md
  }, [])

  const markdownHtml = useMemo(() => {
    if (kind !== 'markdown' || rawText == null) {
      return null
    }

    const env: { paragraphIndex?: number } = { paragraphIndex: 0 }
    return markdownIt.render(rawText, env)
  }, [kind, markdownIt, rawText])

  const markdownNodes = useMemo(() => {
    if (kind !== 'markdown' || markdownHtml == null) {
      return null
    }

    return parse(markdownHtml)
  }, [kind, markdownHtml])

  const handlePdfTextSuccess = useCallback(
    (textContent: PdfTextSuccessArgs) => {
      if (kind !== 'pdf') {
        return
      }

      let cursor = 0
      const offsets = getPdfTextItems(textContent).map((item) => {
        const start = cursor
        cursor += item.str.length
        const end = cursor

        if (item.hasEOL) {
          cursor += 1
        }

        return { start, end }
      })

      setPdfTextOffsets(offsets)
    },
    [kind],
  )

  const renderPdfText = useCallback(
    ({ itemIndex, str }: PdfTextRendererArgs) => {
      const safeText = typeof str === 'string' ? str : ''

      if (!pdfHighlightActive || !pdfHighlightRange) {
        return escapeHtml(safeText)
      }

      const itemOffset = pdfTextOffsets[itemIndex]
      if (!itemOffset) {
        return escapeHtml(safeText)
      }

      const overlapStart = Math.max(pdfHighlightRange.start, itemOffset.start)
      const overlapEnd = Math.min(pdfHighlightRange.end, itemOffset.end)
      if (overlapEnd <= overlapStart) {
        return escapeHtml(safeText)
      }

      const localStart = overlapStart - itemOffset.start
      const localEnd = overlapEnd - itemOffset.start

      return [
        escapeHtml(safeText.slice(0, localStart)),
        `<mark data-evidence-highlight="true" class="rounded bg-highlight/40 px-0.5">${escapeHtml(safeText.slice(localStart, localEnd))}</mark>`,
        escapeHtml(safeText.slice(localEnd)),
      ].join('')
    },
    [pdfHighlightActive, pdfHighlightRange, pdfTextOffsets],
  )

  const handlePdfTextLayerSuccess = useCallback(() => {
    setPdfTextLayerVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!contentUrl || kind === 'pdf') {
      return
    }

    let cancelled = false

    setRawText(null)
    setFetchError(null)

    fetch(contentUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        if (!cancelled) {
          setRawText(text)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setFetchError(err.message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [contentUrl, kind])

  useEffect(() => {
    if (kind !== 'pdf' || (locationPage == null && !pdfHighlightRange)) {
      return
    }

    setPdfHighlightActive(true)
    const timeout = window.setTimeout(() => setPdfHighlightActive(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [kind, locationPage, pdfHighlightRange])

  useEffect(() => {
    if (
      kind !== 'pdf' ||
      !pdfHighlightRange ||
      !pdfHighlightActive ||
      pdfTextLayerVersion === 0
    ) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const highlight = pdfContainerRef.current?.querySelector(
        'mark[data-evidence-highlight="true"]',
      )

      if (highlight instanceof HTMLElement) {
        highlight.scrollIntoView?.({
          block: 'center',
          behavior: 'smooth',
        })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [kind, pdfHighlightActive, pdfHighlightRange, pdfTextLayerVersion])

  const textHighlightRange = useMemo(() => {
    if (kind !== 'text' || rawText == null) {
      return null
    }

    if (locationOffset == null || locationLength == null) {
      return null
    }

    const start = Math.max(0, Math.min(rawText.length, locationOffset))
    const end = Math.max(
      start,
      Math.min(rawText.length, locationOffset + locationLength),
    )
    if (end <= start) {
      return null
    }

    return { start, end }
  }, [kind, locationLength, locationOffset, rawText])

  useEffect(() => {
    if (!textHighlightRange) {
      return
    }

    setTextHighlightActive(true)
    const timeout = window.setTimeout(() => setTextHighlightActive(false), 2000)
    textHighlightRef.current?.scrollIntoView?.({
      block: 'center',
      behavior: 'smooth',
    })

    return () => window.clearTimeout(timeout)
  }, [textHighlightRange])

  useEffect(() => {
    if (kind !== 'markdown') {
      return
    }

    if (!markdownHtml) {
      return
    }

    const container = markdownContainerRef.current
    if (!container) {
      return
    }

    clearEvidenceHighlights(container)

    const paragraphEl =
      findParagraphElement(container, locationParagraph) ??
      (container.querySelector('p') instanceof HTMLElement
        ? (container.querySelector('p') as HTMLElement)
        : null)

    if (!paragraphEl) {
      return
    }

    paragraphEl.dataset.evidenceParagraphHighlight = 'true'
    paragraphEl.classList.add(
      'bg-highlight/10',
      'ring-1',
      'ring-highlight/50',
      'rounded-md',
    )
    paragraphEl.scrollIntoView?.({ block: 'center', behavior: 'smooth' })

    const mark = highlightTextRangeInElement(
      paragraphEl,
      locationOffset ?? 0,
      locationLength ?? 0,
    )
    if (mark) {
      mark.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }

    const timeout = window.setTimeout(() => {
      paragraphEl.removeAttribute('data-evidence-paragraph-highlight')
      paragraphEl.classList.remove(
        'bg-highlight/10',
        'ring-1',
        'ring-highlight/50',
        'rounded-md',
      )
      if (mark) {
        unwrapMark(mark)
      }
    }, 2000)

    return () => window.clearTimeout(timeout)
  }, [kind, locationLength, locationOffset, locationParagraph, markdownHtml])

  if (!docViewer) return null

  return (
    <div
      className={cn('flex h-full flex-col', className)}
      data-testid="document-viewer"
    >
      <DocumentViewerToolbar
        fileName={fileName}
        contentUrl={contentUrl}
        locationLabel={locationLabel}
        onBack={closeDocumentViewer}
      />

      <div className="flex-1 overflow-auto">
        {!hasKbId && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <p className="text-xs text-muted-foreground">
              无法加载文档预览：缺少知识库关联
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              文档 ID：{documentId}
            </p>
          </div>
        )}

        {hasKbId && isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {hasKbId && error && (
          <div className="m-4 rounded-xl border border-error/20 bg-error/5 p-4 text-center">
            <p className="text-xs text-error">加载文档失败</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {error.message}
            </p>
          </div>
        )}

        {hasKbId && contentUrl && kind === 'pdf' && (
          <div
            ref={pdfContainerRef}
            className="relative p-4"
            data-testid="document-viewer-pdf"
          >
            {pdfHighlightActive && !pdfHighlightRange && (
              <div className="pointer-events-none absolute inset-4 rounded-lg bg-highlight/15 ring-1 ring-highlight/40" />
            )}
            <Document
              file={contentUrl}
              loading={
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <Page
                pageNumber={locationPage ?? 1}
                renderTextLayer
                renderAnnotationLayer
                customTextRenderer={renderPdfText}
                onGetTextSuccess={handlePdfTextSuccess}
                onRenderTextLayerSuccess={handlePdfTextLayerSuccess}
              />
            </Document>
          </div>
        )}

        {hasKbId && kind === 'markdown' && rawText != null && (
          <div
            ref={markdownContainerRef}
            className="prose prose-sm dark:prose-invert max-w-none p-4"
            data-testid="document-viewer-markdown"
          >
            {markdownNodes}
          </div>
        )}

        {hasKbId && kind === 'text' && rawText != null && (
          <pre
            className="whitespace-pre-wrap p-4 text-xs leading-6 text-foreground/85"
            data-testid="document-viewer-text"
          >
            {textHighlightRange ? (
              <>
                {rawText.slice(0, textHighlightRange.start)}
                <mark
                  ref={(el) => {
                    textHighlightRef.current = el
                  }}
                  className={cn(
                    'rounded px-0.5',
                    textHighlightActive ? 'bg-highlight/40' : 'bg-transparent',
                  )}
                  data-testid="document-viewer-text-highlight"
                >
                  {rawText.slice(textHighlightRange.start, textHighlightRange.end)}
                </mark>
                {rawText.slice(textHighlightRange.end)}
              </>
            ) : (
              rawText
            )}
          </pre>
        )}

        {hasKbId && fetchError && (
          <div className="m-4 rounded-xl border border-error/20 bg-error/5 p-4 text-center">
            <p className="text-xs text-error">加载文档内容失败</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {fetchError}
            </p>
          </div>
        )}
      </div>
    </div>
  )
})
