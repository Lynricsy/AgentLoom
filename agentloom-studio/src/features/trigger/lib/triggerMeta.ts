import type { StatusTone } from '@/shared/ui/status-badge'
import type { TriggerHistoryStatus, TriggerType } from '../types'

/**
 * 触发器类型 → 文案 + 语气，触发器卡片与创建弹窗的类型选择共用同一份配色：
 * 定时=预警、Webhook=信息、API 事件=品牌。
 */
export const TRIGGER_TYPE_META: Record<
  TriggerType,
  {
    label: string
    tone: StatusTone
    /** 触发器卡片底色/描边 */
    cardClassName: string
    /** 创建弹窗里类型选项的底色/描边/文字色 */
    optionClassName: string
  }
> = {
  cron: {
    label: '定时触发',
    tone: 'warning',
    cardClassName: 'border-warning/20 bg-warning/5',
    optionClassName:
      'border-warning/20 bg-warning/10 text-warning hover:border-warning/40 hover:bg-warning/15',
  },
  webhook: {
    label: 'Webhook',
    tone: 'info',
    cardClassName: 'border-info/20 bg-info/5',
    optionClassName:
      'border-info/20 bg-info/10 text-info hover:border-info/40 hover:bg-info/15',
  },
  api_event: {
    label: 'API Event',
    tone: 'primary',
    cardClassName: 'border-primary/20 bg-primary/5',
    optionClassName:
      'border-primary/20 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15',
  },
}

/** 触发历史状态 → 文案 + 语气 */
export const TRIGGER_HISTORY_STATUS_META: Record<
  TriggerHistoryStatus,
  { label: string; tone: StatusTone }
> = {
  success: { label: '成功', tone: 'success' },
  failed: { label: '失败', tone: 'error' },
  skipped: { label: '跳过', tone: 'neutral' },
  signature_failed: { label: '签名失败', tone: 'warning' },
  ip_rejected: { label: 'IP 被拒', tone: 'error' },
}
