import '@testing-library/jest-dom/vitest'

import { createElement, type ReactNode } from 'react'
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.useRealTimers()
})

vi.mock('react-pdf', () => {
  return {
    pdfjs: {
      GlobalWorkerOptions: {
        workerSrc: '',
      },
    },
    Document: ({ children }: { children?: ReactNode }) =>
      createElement('div', { 'data-testid': 'react-pdf-document' }, children),
    Page: ({ pageNumber }: { pageNumber: number }) =>
      createElement(
        'div',
        { 'data-testid': 'react-pdf-page' },
        `PDF Page ${pageNumber}`,
      ),
  }
})
