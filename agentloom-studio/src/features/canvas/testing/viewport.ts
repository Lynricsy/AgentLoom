/**
 * 画布测试的视口桩。
 *
 * jsdom 没有 `window.matchMedia`，`useMediaQuery` 会一律返回 false，
 * 也就是把所有画布测试推进「小屏只读」分支。既有编辑行为用例必须显式
 * 声明桌面视口，小屏只读用例则显式声明手机视口。
 */

/** 桌面态基准宽度（>= lg 断点 1024px） */
export const DESKTOP_WIDTH = 1280

/** 手机态基准宽度（< lg 断点） */
export const MOBILE_WIDTH = 375

const MIN_WIDTH_PATTERN = /min-width:\s*(\d+)px/

export function stubViewportWidth(width: number): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      const minWidth = MIN_WIDTH_PATTERN.exec(query)

      return {
        matches: minWidth ? width >= Number(minWidth[1]) : false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
      }
    },
  })
}

export function restoreViewport(): void {
  Reflect.deleteProperty(window, 'matchMedia')
}
