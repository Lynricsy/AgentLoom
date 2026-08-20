import type { OverlayHandleSnapshot } from '../components/overlays/ConnectionStateOverlay'

/**
 * 拖连线时用于端口高亮的 DOM 选择器与 CSS 类名。
 * 与 index.css 中定义的类名保持一致。
 */
export const HANDLE_SELECTOR = '[data-node-id][data-port-id][data-port-direction]'
export const SOURCE_CLASS = 'typed-port--connect-source'
export const COMPATIBLE_CLASS = 'typed-port--connect-compatible'
export const INCOMPATIBLE_CLASS = 'connection-overlay-port-dimmed'
export const HOVER_COMPATIBLE_CLASS = 'typed-port--connect-hover-compatible'
export const HOVER_INCOMPATIBLE_CLASS = 'typed-port--connect-hover-incompatible'

export interface ActiveConnectionState {
  sourceHandle: OverlayHandleSnapshot
  compatibleTargets: OverlayHandleSnapshot[]
  incompatibleTargets: OverlayHandleSnapshot[]
}

function escapeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function readClientPoint(
  event: MouseEvent | PointerEvent | TouchEvent,
): { x: number; y: number } | null {
  if ('touches' in event) {
    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  return { x: event.clientX, y: event.clientY }
}

export function getHandleElement(
  root: HTMLElement,
  nodeId: string,
  portId: string,
  direction: 'input' | 'output',
): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    `${HANDLE_SELECTOR}[data-node-id="${escapeSelectorValue(nodeId)}"][data-port-id="${escapeSelectorValue(portId)}"][data-port-direction="${direction}"]`,
  )
}

export function clearConnectionClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      `.${SOURCE_CLASS}, .${COMPATIBLE_CLASS}, .${INCOMPATIBLE_CLASS}, .${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
    )
    .forEach((element) => {
      element.classList.remove(
        SOURCE_CLASS,
        COMPATIBLE_CLASS,
        INCOMPATIBLE_CLASS,
        HOVER_COMPATIBLE_CLASS,
        HOVER_INCOMPATIBLE_CLASS,
      )
    })
}

/** 只清 hover 态：拖拽过程中源/候选高亮必须保留 */
export function clearHoverClasses(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      `.${HOVER_COMPATIBLE_CLASS}, .${HOVER_INCOMPATIBLE_CLASS}`,
    )
    .forEach((element) => {
      element.classList.remove(HOVER_COMPATIBLE_CLASS, HOVER_INCOMPATIBLE_CLASS)
    })
}

export function readHandleSnapshot(
  element: HTMLElement,
  containerRect: DOMRect,
): OverlayHandleSnapshot | null {
  const nodeId = element.dataset.nodeId
  const portId = element.dataset.portId
  if (!nodeId || !portId) {
    return null
  }

  const rect = element.getBoundingClientRect()
  return {
    nodeId,
    portId,
    x: rect.left - containerRect.left + rect.width / 2,
    y: rect.top - containerRect.top + rect.height / 2,
  }
}

export function applyConnectionClasses(
  root: HTMLElement,
  state: ActiveConnectionState,
) {
  clearConnectionClasses(root)

  const sourceElement = getHandleElement(
    root,
    state.sourceHandle.nodeId,
    state.sourceHandle.portId,
    'output',
  )
  sourceElement?.classList.add(SOURCE_CLASS)

  state.compatibleTargets.forEach((target) => {
    getHandleElement(
      root,
      target.nodeId,
      target.portId,
      'input',
    )?.classList.add(COMPATIBLE_CLASS)
  })

  state.incompatibleTargets.forEach((target) => {
    getHandleElement(
      root,
      target.nodeId,
      target.portId,
      'input',
    )?.classList.add(INCOMPATIBLE_CLASS)
  })
}
