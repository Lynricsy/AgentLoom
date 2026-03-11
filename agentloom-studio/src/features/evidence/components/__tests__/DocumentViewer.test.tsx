import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import parse from 'html-react-parser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentContent } from '../../api/evidenceQueries'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
} from '../../stores/evidenceUiStore'
import type { DocumentViewerState } from '../../stores/evidenceUiStore'
import { DocumentViewer } from '../DocumentViewer'

vi.mock('react-pdf', async () => {
  const React = await import('react')

  const textItems = [
    { str: 'Hello ', hasEOL: false },
    { str: 'world', hasEOL: false },
  ]

  return {
    pdfjs: {
      GlobalWorkerOptions: {
        workerSrc: '',
      },
    },
    Document: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="react-pdf-document">{children}</div>
    ),
    Page: ({
      pageNumber,
      customTextRenderer,
      onGetTextSuccess,
      onRenderTextLayerSuccess,
    }: {
      pageNumber: number
      customTextRenderer?: (args: { str: string; itemIndex: number }) => string
      onGetTextSuccess?: (textContent: { items: typeof textItems }) => void
      onRenderTextLayerSuccess?: () => void
    }) => {
      React.useEffect(() => {
        onGetTextSuccess?.({ items: textItems })
      }, [onGetTextSuccess])

      React.useEffect(() => {
        onRenderTextLayerSuccess?.()
      }, [customTextRenderer, onRenderTextLayerSuccess])

      return (
        <div data-testid="react-pdf-page">
          <div>{`PDF Page ${pageNumber}`}</div>
          <div className="react-pdf__Page__textContent">
            {textItems.map((item, itemIndex) => {
              const rendered =
                customTextRenderer?.({ str: item.str, itemIndex }) ?? item.str

              return (
                <span key={`${item.str}-${itemIndex}`}>{parse(rendered)}</span>
              )
            })}
          </div>
        </div>
      )
    },
  }
})

vi.mock('../../stores/evidenceUiStore', () => ({
  useEvidenceUiActions: vi.fn(),
  useEvidenceUiDocumentViewer: vi.fn(),
}))

vi.mock('../../api/evidenceQueries', () => ({
  useDocumentContent: vi.fn(),
}))

function createViewerState(
  overrides: Partial<DocumentViewerState> = {},
): DocumentViewerState {
  return {
    evidenceId: 'ev-001',
    documentId: 'doc-001',
    knowledgeBaseId: 'kb-001',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    physicalLocation: {
      page: 3,
      offset: 6,
      length: 5,
      chunkId: 'chunk-001',
    },
    ...overrides,
  }
}

describe('DocumentViewer', () => {
  const closeDocumentViewer = vi.fn()
  const fetchMock = vi.fn()
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })

    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(createViewerState())
    vi.mocked(useEvidenceUiActions).mockReturnValue({
      closeDocumentViewer,
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      selectEvidence: vi.fn(),
      openDocumentViewer: vi.fn(),
      openFromPhysicalLocation: vi.fn(),
      clearHighlight: vi.fn(),
      reset: vi.fn(),
    })
    vi.mocked(useDocumentContent).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('默认文档内容'),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    })
  })

  it('无文档查看器状态时不渲染', () => {
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(null)

    render(<DocumentViewer />)

    expect(screen.queryByTestId('document-viewer')).not.toBeInTheDocument()
  })

  it('PDF文件渲染 react-pdf Page 并高亮精确文本范围', async () => {
    vi.mocked(useDocumentContent).mockReturnValue({
      data: {
        data: {
          url: 'https://example.com/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          expiresIn: 3600,
        },
      },
      isLoading: false,
      error: null,
    } as never)

    render(<DocumentViewer />)

    expect(screen.getByTestId('document-viewer-pdf')).toBeInTheDocument()
    expect(screen.getByTestId('react-pdf-document')).toBeInTheDocument()
    expect(screen.getByText('PDF Page 3')).toBeInTheDocument()

    await waitFor(() => {
      const highlight = document.querySelector('mark[data-evidence-highlight="true"]')
      expect(highlight).toHaveTextContent('world')
    })

    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Markdown文件渲染内容', async () => {
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(
      createViewerState({
        fileName: 'guide.md',
        mimeType: 'text/markdown',
        physicalLocation: undefined,
      }),
    )
    vi.mocked(useDocumentContent).mockReturnValue({
      data: {
        data: {
          url: 'https://example.com/guide.md',
          fileName: 'guide.md',
          mimeType: 'text/markdown',
          expiresIn: 3600,
        },
      },
      isLoading: false,
      error: null,
    } as never)
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('# 标题\n\nMarkdown 内容'),
    })

    render(<DocumentViewer />)

    await waitFor(() => {
      expect(screen.getByTestId('document-viewer-markdown')).toBeInTheDocument()
    })

    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('Markdown 内容')).toBeInTheDocument()
  })

  it('纯文本文件显示pre标签', async () => {
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(
      createViewerState({
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        physicalLocation: undefined,
      }),
    )
    vi.mocked(useDocumentContent).mockReturnValue({
      data: {
        data: {
          url: 'https://example.com/notes.txt',
          fileName: 'notes.txt',
          mimeType: 'text/plain',
          expiresIn: 3600,
        },
      },
      isLoading: false,
      error: null,
    } as never)
    fetchMock.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('纯文本内容'),
    })

    render(<DocumentViewer />)

    await waitFor(() => {
      expect(screen.getByTestId('document-viewer-text')).toBeInTheDocument()
    })

    expect(screen.getByTestId('document-viewer-text')).toHaveTextContent(
      '纯文本内容',
    )
  })

  it('加载中显示骨架屏', () => {
    vi.mocked(useDocumentContent).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    const { container } = render(<DocumentViewer />)

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('返回按钮调用closeDocumentViewer', () => {
    render(<DocumentViewer />)

    fireEvent.click(screen.getByTestId('document-viewer-back'))

    expect(closeDocumentViewer).toHaveBeenCalledTimes(1)
  })
})
