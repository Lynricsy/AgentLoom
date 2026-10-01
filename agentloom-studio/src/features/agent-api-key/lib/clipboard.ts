/** `navigator.clipboard` 不可用时选中文本，让用户手动 Ctrl/Cmd + C */
export function selectElementText(element: HTMLElement | null): boolean {
  const selection = globalThis.getSelection?.()

  if (!element || !selection || typeof document.createRange !== 'function') {
    return false
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)

  return true
}

/**
 * 写入剪贴板；失败时退化为选中 `fallbackElement` 的文本。
 * 返回 `copied` 表示已写入剪贴板，`selected` 表示已选中待手动复制，`failed` 两者都不行。
 */
export async function copyText(
  text: string,
  fallbackElement: HTMLElement | null,
): Promise<'copied' | 'selected' | 'failed'> {
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('clipboard unavailable')
    }

    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return selectElementText(fallbackElement) ? 'selected' : 'failed'
  }
}
