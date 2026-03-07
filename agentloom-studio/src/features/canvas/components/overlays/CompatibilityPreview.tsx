import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
} from 'react'
import type { CanvasEdgeData, VisualCompatibilityLevel } from '../../types'

export interface CompatibilityPreviewHandle {
  setPosition: (x: number, y: number) => void
}

export interface CompatibilityPreviewProps {
  visible: boolean
  x: number
  y: number
  visualLevel: VisualCompatibilityLevel
  reasonKey: string | null
  metadata: CanvasEdgeData['metadata']
}

const OFFSET_X = 8
const OFFSET_Y = 8

function applyPosition(element: HTMLDivElement | null, x: number, y: number) {
  if (!element) {
    return
  }

  element.style.left = `${x + OFFSET_X}px`
  element.style.top = `${y + OFFSET_Y}px`
}

function buildMessage(
  visualLevel: VisualCompatibilityLevel,
  reasonKey: string | null,
  metadata: CompatibilityPreviewProps['metadata'],
): string {
  switch (visualLevel) {
    case 'L0':
      return 'L0 · 完全匹配'
    case 'L1': {
      const autoMatched = metadata.matchedRequiredCount ?? 0
      const totalRequired = metadata.totalRequiredCount ?? 0
      const unmapped = metadata.unmappedRequiredCount ?? 0
      if (totalRequired > 0) {
        return `L1 · ${autoMatched}/${totalRequired} 字段自动匹配，${unmapped} 个待确认`
      }
      return reasonKey ? `L1 · ${reasonKey}` : 'L1 · 需要转换'
    }
    case 'checking':
      return '检查中...'
    case 'error':
      return `不兼容: ${reasonKey ?? '未知原因'}`
    default:
      return '检查中...'
  }
}

const CompatibilityPreviewInner = forwardRef(function CompatibilityPreview(
  {
    visible,
    x,
    y,
    visualLevel,
    reasonKey,
    metadata,
  }: CompatibilityPreviewProps,
  ref: ForwardedRef<CompatibilityPreviewHandle>,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const message = buildMessage(visualLevel, reasonKey, metadata)
  const cssLevel = visualLevel.toLowerCase()

  useLayoutEffect(() => {
    applyPosition(rootRef.current, x, y)
  }, [x, y])

  useImperativeHandle(
    ref,
    () => ({
      setPosition(nextX: number, nextY: number) {
        applyPosition(rootRef.current, nextX, nextY)
      },
    }),
    [],
  )

  return (
    <div
      ref={rootRef}
      className={`compatibility-preview${visible ? ' compatibility-preview--visible' : ''}`}
      data-testid="compatibility-preview"
      role="tooltip"
      aria-hidden={!visible}
    >
      <span
        className={`compatibility-preview__level compatibility-preview__level--${cssLevel}`}
        aria-hidden="true"
      />
      <span data-testid="compatibility-preview-message">{message}</span>
    </div>
  )
})

export const CompatibilityPreview = memo(CompatibilityPreviewInner)
