/**
 * 画布浮层的统一外观。
 *
 * 迁移前画布上共存 4 种浮层语言（半透明 + blur 的工具条、实色的属性面板、
 * `rounded-lg` 的 Agent 面板、`rounded-full bg-background/85` 的胶囊按钮），
 * 在同一屏内互相冲突。这里收敛为一种：xl 圆角 + 半透明表面 + 浮层阴影 + 轻模糊。
 *
 * `backdrop-blur` 的白名单只有本常量与 `shared/ui/overlay.ts` 的 OVERLAY_CLASS。
 */
export const CANVAS_FLOATING_CLASS =
  'rounded-xl border border-border bg-surface/90 shadow-lg backdrop-blur-sm'

/** 画布侧面板的头部行（属性面板、版本历史、执行记录…） */
export const CANVAS_PANEL_HEADER_CLASS =
  'flex items-center gap-3 border-b border-border px-4 py-3'
