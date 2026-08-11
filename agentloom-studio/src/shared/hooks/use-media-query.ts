import { useCallback, useMemo, useSyncExternalStore } from 'react'

/** lg 断点（1024px），与 Tailwind 默认断点一致 */
export const LG_QUERY = '(min-width: 1024px)'

/** 旧版 Safari（<14）只有 addListener/removeListener，没有 addEventListener */
type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
}

const NOOP_UNSUBSCRIBE = () => {}

/**
 * 订阅媒体查询结果。用 useSyncExternalStore 而非 useEffect，
 * 首帧即拿到真实匹配值，避免「先渲染移动端再跳桌面端」的闪烁。
 */
export function useMediaQuery(query: string): boolean {
  // jsdom / SSR / 残缺桩环境下取不到 MediaQueryList，降级为「未匹配」而不是抛错
  const mediaQueryList = useMemo<LegacyMediaQueryList | null>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null
    }
    try {
      return window.matchMedia(query) as LegacyMediaQueryList
    } catch {
      return null
    }
  }, [query])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!mediaQueryList) return NOOP_UNSUBSCRIBE

      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', onStoreChange)
        return () => {
          mediaQueryList.removeEventListener('change', onStoreChange)
        }
      }

      if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(onStoreChange)
        return () => {
          mediaQueryList.removeListener?.(onStoreChange)
        }
      }

      return NOOP_UNSUBSCRIBE
    },
    [mediaQueryList],
  )

  const getSnapshot = useCallback(
    () => mediaQueryList?.matches ?? false,
    [mediaQueryList],
  )

  // 服务端快照统一为 false，与无 matchMedia 环境保持一致
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
