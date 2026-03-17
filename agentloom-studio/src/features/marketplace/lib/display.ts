import type {
  MarketplaceListingType,
  MarketplacePricingModel,
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
