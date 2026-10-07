/**
 * 全站唯一的模态遮罩样式。
 *
 * 之前 Dialog / Sheet / AlertDialog 与 16 个自建弹窗各写一遍遮罩，
 * 出现过 bg-black/40、/50、/55、/70 与「有无 blur」的四种组合。
 * 这里收敛为一处，`backdrop-blur` 也只允许出现在本常量与
 * `features/canvas/components/canvasChrome.ts` 的画布浮层常量中。
 */
export const OVERLAY_CLASS =
  'fixed inset-0 z-50 bg-black/50 backdrop-blur-xs'
