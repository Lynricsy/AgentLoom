import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { LG_QUERY, useMediaQuery } from './use-media-query'

type ChangeListener = (event: MediaQueryListEvent) => void

interface MediaQueryStub {
  /** 修改匹配结果并广播 change，模拟视口跨越断点 */
  emit: (matches: boolean) => void
  removeEventListener: Mock<(type: string, listener: ChangeListener) => void>
  listenerCount: () => number
}

/** 安装一个可控的 window.matchMedia 桩；jsdom 本身没有该 API */
function stubMatchMedia(initialMatches: boolean): MediaQueryStub {
  const listeners = new Set<ChangeListener>()
  const state = { matches: initialMatches }

  const addEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') listeners.add(listener)
  })
  const removeEventListener = vi.fn((type: string, listener: ChangeListener) => {
    if (type === 'change') listeners.delete(listener)
  })

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({
      get matches() {
        return state.matches
      },
      media,
      onchange: null,
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    }),
  })

  return {
    emit(matches: boolean) {
      state.matches = matches
      for (const listener of listeners) {
        listener({ matches, media: LG_QUERY } as MediaQueryListEvent)
      }
    },
    removeEventListener,
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('useMediaQuery', () => {
  it('环境没有 matchMedia 时返回 false 且不抛错', () => {
    expect(window.matchMedia).toBeUndefined()

    const { result } = renderHook(() => useMediaQuery(LG_QUERY))

    expect(result.current).toBe(false)
  })

  it('首帧即返回 matchMedia 的真实匹配值', () => {
    stubMatchMedia(true)

    const { result } = renderHook(() => useMediaQuery(LG_QUERY))

    expect(result.current).toBe(true)
  })

  it('媒体查询变化时重渲染为新值', () => {
    const stub = stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery(LG_QUERY))

    expect(result.current).toBe(true)

    act(() => {
      stub.emit(false)
    })

    expect(result.current).toBe(false)

    act(() => {
      stub.emit(true)
    })

    expect(result.current).toBe(true)
  })

  it('卸载时移除 change 监听器', () => {
    const stub = stubMatchMedia(false)
    const { unmount } = renderHook(() => useMediaQuery(LG_QUERY))

    expect(stub.listenerCount()).toBe(1)

    unmount()

    expect(stub.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    )
    expect(stub.listenerCount()).toBe(0)
  })

  it('旧版 Safari 只有 addListener/removeListener 时同样可用', () => {
    const listeners = new Set<ChangeListener>()
    const removeListener = vi.fn((listener: ChangeListener) => {
      listeners.delete(listener)
    })
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (media: string) => ({
        matches: true,
        media,
        addListener: (listener: ChangeListener) => listeners.add(listener),
        removeListener,
      }),
    })

    const { result, unmount } = renderHook(() => useMediaQuery(LG_QUERY))

    expect(result.current).toBe(true)
    expect(listeners.size).toBe(1)

    unmount()

    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})
