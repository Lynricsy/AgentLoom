import { memo } from 'react';
import type { VisualCompatibilityLevel } from '../../types';

/** 兼容性预览浮层的属性 */
export interface CompatibilityPreviewProps {
  /** 是否显示 */
  visible: boolean;
  /** 光标 X 坐标（viewport） */
  x: number;
  /** 光标 Y 坐标（viewport） */
  y: number;
  /** 视觉兼容性级别 */
  visualLevel: VisualCompatibilityLevel;
  /** 兼容性原因描述 key */
  reasonKey: string | null;
  /** PARTIAL 级别的附加元数据 */
  metadata: {
    matchedRatio?: number;
    matchedRequiredCount?: number;
    totalRequiredCount?: number;
    unmappedRequiredCount?: number;
  };
}

/** 固定偏移量（像素） */
const OFFSET_X = 8;
const OFFSET_Y = 8;

/** 根据视觉级别生成用户可读的消息文案 */
function buildMessage(
  visualLevel: VisualCompatibilityLevel,
  reasonKey: string | null,
  metadata: CompatibilityPreviewProps['metadata'],
): string {
  switch (visualLevel) {
    case 'L0':
      return 'Exact match';
    case 'L1': {
      const { matchedRequiredCount, totalRequiredCount, unmappedRequiredCount } =
        metadata;
      if (
        totalRequiredCount !== undefined &&
        matchedRequiredCount !== undefined
      ) {
        const unmapped = unmappedRequiredCount ?? 0;
        return unmapped > 0
          ? `${matchedRequiredCount}/${totalRequiredCount} required fields matched — ${unmapped} unmapped`
          : `${matchedRequiredCount}/${totalRequiredCount} required fields matched`;
      }
      return reasonKey ?? 'Transform needed';
    }
    case 'checking':
      return 'Checking compatibility…';
    case 'error':
      return reasonKey ?? 'Incompatible';
    default:
      return 'Unknown';
  }
}

/**
 * 纯展示的兼容性预览浮层。
 * 跟随光标位置显示当前连接的兼容性级别与详情。
 * 不持有内部状态，坐标由外部节流后传入。
 */
export const CompatibilityPreview = memo(function CompatibilityPreview({
  visible,
  x,
  y,
  visualLevel,
  reasonKey,
  metadata,
}: CompatibilityPreviewProps) {
  const message = buildMessage(visualLevel, reasonKey, metadata);
  const cssLevel = visualLevel.toLowerCase();

  return (
    <div
      className={`compatibility-preview${visible ? ' compatibility-preview--visible' : ''}`}
      style={{ left: x + OFFSET_X, top: y + OFFSET_Y }}
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
  );
});
