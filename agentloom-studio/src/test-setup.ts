import '@testing-library/jest-dom/vitest'

import { createElement, type ReactNode } from 'react'
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.useRealTimers()
})

// ── jsdom 缺失的浏览器 API ────────────────────────────────
// cmdk 依赖 ResizeObserver；Radix Select/ScrollArea 依赖 Pointer Capture 与 scrollIntoView。
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
}

vi.mock('@/shared/hooks/use-theme', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

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
