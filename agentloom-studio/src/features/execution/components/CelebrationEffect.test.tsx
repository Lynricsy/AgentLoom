import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CelebrationEffect, getCelebrationStorageKey } from './CelebrationEffect'

const mocks = vi.hoisted(() => ({
  confettiMock: vi.fn(),
}))

vi.mock('canvas-confetti', () => ({
  default: mocks.confettiMock,
}))

function createMockStorage(): Storage {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
}

describe('CelebrationEffect', () => {
  let mockStorage: Storage

  beforeEach(() => {
    mockStorage = createMockStorage()
    vi.stubGlobal('localStorage', mockStorage)
    vi.useFakeTimers()
    mocks.confettiMock.mockReset()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('首次挂载历史 completed 执行时不触发庆祝', () => {
    render(
      <CelebrationEffect workflowId="wf-001" executionId="exec-001" executionStatus="completed" />,
    )

    act(() => {
      vi.runAllTimers()
    })

    expect(mocks.confettiMock).not.toHaveBeenCalled()
    expect(mockStorage.getItem(getCelebrationStorageKey('wf-001'))).toBeNull()
  })

  it('同一 workflow 首次成功时触发庆祝并写入 workflow 级别标记', () => {
    const { rerender } = render(
      <CelebrationEffect workflowId="wf-001" executionId="exec-001" executionStatus="running" />,
    )

    rerender(
      <CelebrationEffect workflowId="wf-001" executionId="exec-001" executionStatus="completed" />,
    )

    act(() => {
      vi.runAllTimers()
    })

    expect(mocks.confettiMock).toHaveBeenCalledTimes(3)
    expect(mockStorage.getItem(getCelebrationStorageKey('wf-001'))).toBe('true')
  })

  it('不同 workflow 的首次成功互不影响', () => {
    mockStorage.setItem(getCelebrationStorageKey('wf-001'), 'true')

    const { rerender } = render(
      <CelebrationEffect workflowId="wf-002" executionId="exec-002" executionStatus="running" />,
    )

    rerender(
      <CelebrationEffect workflowId="wf-002" executionId="exec-002" executionStatus="completed" />,
    )

    act(() => {
      vi.runAllTimers()
    })

    expect(mocks.confettiMock).toHaveBeenCalledTimes(3)
    expect(mockStorage.getItem(getCelebrationStorageKey('wf-001'))).toBe('true')
    expect(mockStorage.getItem(getCelebrationStorageKey('wf-002'))).toBe('true')
  })
})
