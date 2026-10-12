import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PublicMarketplaceListingItem } from '../../types'
import { MarketplaceListingCard } from '../MarketplaceListingCard'

function makeListing(
  overrides: Partial<PublicMarketplaceListingItem> = {},
): PublicMarketplaceListingItem {
  return {
    id: 'listing-1',
    title: 'Agent Workflow',
    summary: 'A marketplace workflow.',
    tags: [],
    coverImageUrl: null,
    category: 'analysis',
    useCount: 0,
    avgRating: null,
    reviewCount: 0,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '酒狐' },
    listingType: 'workflow',
    pricingModel: 'free',
    pricePerExecution: null,
    plugin: null,
    previewGraph: {
      nodes: [
        { id: 'a', x: 0, y: 0, width: 200, height: 120, category: 'trigger', nodeType: 'manual-trigger' },
        { id: 'b', x: 400, y: 40, width: 200, height: 120, category: 'agent', nodeType: 'agent' },
      ],
      edges: [{ source: 'a', target: 'b' }],
    },
    ...overrides,
  }
}

describe('MarketplaceListingCard 封面区', () => {
  it('没有封面时画工作流缩略图', () => {
    render(<MarketplaceListingCard listing={makeListing()} onClick={vi.fn()} />)

    const thumbnail = screen.getByTestId('marketplace-card-thumbnail')
    expect(thumbnail.querySelectorAll('rect')).toHaveLength(2)
    // 连线从源节点右侧中点 (200, 60) 出发、落到目标左侧中点 (400, 100)
    expect(thumbnail.querySelector('path[d^="M 200 60 C"][d$="400 100"]')).not.toBeNull()
  })

  it('作者封面优先；封面加载失败后回退到缩略图', () => {
    const { container } = render(
      <MarketplaceListingCard
        listing={makeListing({ coverImageUrl: 'https://example.com/cover.png' })}
        onClick={vi.fn()}
      />,
    )

    const cover = container.querySelector('img')
    expect(cover).not.toBeNull()
    expect(screen.queryByTestId('marketplace-card-thumbnail')).not.toBeInTheDocument()

    fireEvent.error(cover!)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('marketplace-card-thumbnail')).toBeInTheDocument()
  })

  it('插件没有缩略图时显示插件标识与版本', () => {
    render(
      <MarketplaceListingCard
        listing={makeListing({
          listingType: 'plugin',
          previewGraph: null,
          plugin: {
            pluginId: 'com.example.transform',
            name: 'Transform',
            version: '1.2.3',
            author: 'AgentLoom',
            description: null,
            license: null,
          },
        })}
        onClick={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('marketplace-card-thumbnail')).not.toBeInTheDocument()
    expect(screen.getByText('com.example.transform')).toBeInTheDocument()
    expect(screen.getByText('v1.2.3')).toBeInTheDocument()
  })
})
