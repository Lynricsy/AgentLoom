/**
 * 全局动画规范 — 项目内所有 motion 动画参数只能从此处取，禁止就地硬编码时长/缓动。
 *
 * 配合 `app/providers.tsx` 中的 `<MotionConfig reducedMotion="user">`：
 * 系统开启「减少动态效果」时由 motion 自动降级，无需在调用点判断。
 */

/** 动画时长（秒） */
export const DUR = {
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
} as const

/** 主缓动曲线（easeOutExpo 风格） */
export const EASE = [0.16, 1, 0.3, 1] as const

/** 通用淡入上浮 — 卡片、弹层内容 */
export const fadeInUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: DUR.base, ease: EASE },
} as const

/** 纯淡入 — 遮罩层 */
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.fast, ease: EASE },
} as const

/** 缩放淡入 — Dialog / Popover 内容 */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: DUR.base, ease: EASE },
} as const

/** 右侧面板滑入 — NodeConfigPanel / Sheet(right) */
export const panelSlideRight = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 16 },
  transition: { duration: DUR.base, ease: EASE },
} as const

/** 左侧面板滑入 — 移动端导航 Sheet(left) */
export const panelSlideLeft = {
  initial: { opacity: 0, x: -16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
  transition: { duration: DUR.base, ease: EASE },
} as const

/** 底部面板滑入 — Sheet(bottom) */
export const panelSlideUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 24 },
  transition: { duration: DUR.base, ease: EASE },
} as const

/** 列表逐项入场 — 延迟上限 0.3s，避免长列表尾部迟滞 */
export function staggerList(index: number) {
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: DUR.fast,
      ease: EASE,
      delay: Math.min(index * 0.03, 0.3),
    },
  } as const
}
