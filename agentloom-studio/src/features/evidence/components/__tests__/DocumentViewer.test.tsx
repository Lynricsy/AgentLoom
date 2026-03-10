import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentContent } from '../../api/evidenceQueries'
import {
  useEvidenceUiActions,
  useEvidenceUiDocumentViewer,
} from '../../stores/evidenceUiStore'
import type { DocumentViewerState } from '../../stores/evidenceUiStore'
import { DocumentViewer } from '../DocumentViewer'

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
    page: 3,
    chunkId: 'chunk-001',
    ...overrides,
  }
}

describe('DocumentViewer', () => {
  const closeDocumentViewer = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)

    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(createViewerState())
    vi.mocked(useEvidenceUiActions).mockReturnValue({
      closeDocumentViewer,
      openPanel: vi.fn(),
      closePanel: vi.fn(),
      selectEvidence: vi.fn(),
      openDocumentViewer: vi.fn(),
      openFromPhysicalLocation: vi.fn(),
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
  })

  it('无文档查看器状态时不渲染', () => {
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(null)

    render(<DocumentViewer />)

    expect(screen.queryByTestId('document-viewer')).not.toBeInTheDocument()
  })

  it('PDF文件显示iframe', () => {
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

    const iframe = screen.getByTestId('document-viewer-pdf')
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining('https://example.com/report.pdf#page=3'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Markdown文件渲染内容', async () => {
    vi.mocked(useEvidenceUiDocumentViewer).mockReturnValue(
      createViewerState({
        fileName: 'guide.md',
        mimeType: 'text/markdown',
        page: undefined,
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
        page: undefined,
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
