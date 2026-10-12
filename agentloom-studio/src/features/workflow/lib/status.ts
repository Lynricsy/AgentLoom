import type { StatusTone } from '@/shared/ui/status-badge'
import type { WorkflowStatus } from '../types'

/**
 * 工作流状态 → 文案 + 语气。与 Agent 列表保持同一套语义：
 * 草稿 warning（尚未发布）、已发布 success、已归档 neutral。
 */
export const WORKFLOW_STATUS_META: Record<
  WorkflowStatus,
  { label: string; tone: StatusTone }
> = {
  draft: { label: '草稿', tone: 'warning' },
  published: { label: '已发布', tone: 'success' },
  archived: { label: '已归档', tone: 'neutral' },
}
