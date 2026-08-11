import { Puzzle, Workflow, type LucideIcon } from 'lucide-react'

import type { BadgeProps } from '@/shared/ui/badge'
import {
  MARKETPLACE_CATEGORIES,
  type MarketplaceCategory,
  type MarketplaceListingStatus,
  type MarketplaceListingType,
  type MarketplacePricingModel,
} from '../types'

export type MarketplaceListingTypeFilter = MarketplaceListingType | 'all'

export const MARKETPLACE_LISTING_TYPE_TABS: Array<{
  value: MarketplaceListingTypeFilter
  label: string
}> = [
  { value: 'all', label: '全部内容' },
  { value: 'workflow', label: '工作流' },
  { value: 'plugin', label: '插件' },
]

/** 上架类型的展示元数据：图标与令牌色，供卡片/徽章/详情统一取用 */
export const MARKETPLACE_LISTING_TYPE_META: Record<
  MarketplaceListingType,
  { label: string; icon: LucideIcon; tone: string }
> = {
  workflow: { label: '工作流', icon: Workflow, tone: 'var(--color-node-output)' },
  plugin: { label: '插件', icon: Puzzle, tone: 'var(--color-node-plugin)' },
}

/** 计费模式 → Badge 语义变体 */
export const MARKETPLACE_PRICING_VARIANT: Record<
  MarketplacePricingModel,
  NonNullable<BadgeProps['variant']>
> = {
  free: 'success',
  per_execution: 'warning',
}

/** 上架状态 → Badge 语义变体 */
export const MARKETPLACE_STATUS_VARIANT: Record<
  MarketplaceListingStatus,
  NonNullable<BadgeProps['variant']>
> = {
  pending_review: 'warning',
  listed: 'success',
  review_failed: 'error',
  unlisted: 'secondary',
}

export const MARKETPLACE_CATEGORY_LABELS = Object.fromEntries(
  MARKETPLACE_CATEGORIES.map((category) => [category.value, category.label]),
) as Record<MarketplaceCategory, string>

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
})

export function formatMarketplacePrice(
  pricingModel: MarketplacePricingModel,
  pricePerExecution: string | null,
): string {
  if (pricingModel === 'free') {
    return '免费'
  }

  if (!pricePerExecution) {
    return '按次计费'
  }

  const value = Number(pricePerExecution)

  if (!Number.isFinite(value)) {
    return '按次计费'
  }

  return `${usdFormatter.format(value)}/次`
}

/** 后端评分以字符串下发，非法值按“无评分”处理 */
export function parseMarketplaceRating(value: string | null): number | null {
  if (value == null) return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
