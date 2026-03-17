import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  PublicMarketplaceListingDetail,
  PublicWorkflowListingDetail,
  PublicPluginListingDetail,
  ReviewsResponse,
} from '../../types'

vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => (
    <div
      data-testid="reactflow-preview"
      data-fit-view={props.fitView}
      data-nodes-draggable={props.nodesDraggable}
      data-nodes-connectable={props.nodesConnectable}
      data-elements-selectable={props.elementsSelectable}
      data-pan-on-drag={props.panOnDrag}
      data-zoom-on-scroll={props.zoomOnScroll}
    >
      {(props.children as React.ReactNode) ?? null}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => <div data-testid="reactflow-background" />,
  BackgroundVariant: { Dots: 'dots' },
}))

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react')
  const { Fragment, createContext, useContext, cloneElement, isValidElement } = React

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void
  } | null>(null)

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean
    onOpenChange?: (open: boolean) => void
    children?: React.ReactNode
  }) {
    if (!open) {
      return null
    }

    return React.createElement(
      DialogContext.Provider,
      { value: { onOpenChange } },
      children,
    )
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children)
  }

  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props)
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props })
  }

  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props)
  }

  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props)
  }

  type CloseChildProps = {
    onClick?: React.MouseEventHandler
  }

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean
    children?: React.ReactNode
  }) {
    const ctx = useContext(DialogContext)
    const onOpenChange = ctx?.onOpenChange

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event)
          onOpenChange?.(false)
        },
      })
    }

    return React.createElement(
      'button',
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    )
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close }
})

const { detailQueryMock, reviewsQueryMock } = vi.hoisted(() => ({
  detailQueryMock: {
    data: undefined as PublicMarketplaceListingDetail | undefined,
    isLoading: false,
    isError: false,
  },
  reviewsQueryMock: {
    data: undefined as ReviewsResponse | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}))

vi.mock('../../api/publicMarketplaceQueries', () => ({
  usePublicListingDetail: () => detailQueryMock,
  useListingReviews: () => reviewsQueryMock,
}))

vi.mock('../ReviewForm', () => ({
  ReviewForm: () => <div data-testid="review-form" />,
}))

vi.mock('../MarketplaceInstallDialog', () => ({
  MarketplaceInstallDialog: ({
    open,
    listingTitle,
    listingType,
  }: {
    open: boolean
    listingTitle: string
    listingType: string
  }) => (open ? <div data-testid="marketplace-install-dialog" data-listing-type={listingType}>Install: {listingTitle}</div> : null),
}))

function makeListingDetail(
  overrides: Partial<PublicWorkflowListingDetail> = {},
): PublicWorkflowListingDetail {
  return {
    id: 'listing-1',
    title: 'Agent Workflow',
    summary: 'A detailed workflow summary for marketplace preview.',
    tags: ['agent', 'automation'],
    coverImageUrl: null,
    category: 'analysis',
    useCount: 42,
    avgRating: '4.5',
    reviewCount: 2,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: '酒狐' },
    listingType: 'workflow',
    pricingModel: 'free',
    pricePerExecution: null,
    plugin: null,
    definition: {
      nodes: [
        {
          id: 'node-1',
          position: { x: 0, y: 0 },
          data: { label: 'Start' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    reviews: [
      {
        id: 'review-1',
        rating: 5,
        content: 'Great workflow!',
        createdAt: '2026-03-15T00:00:00.000Z',
        author: { displayName: '测试用户' },
      },
    ],
    ...overrides,
  }
}

function makePluginListingDetail(
  overrides: Partial<PublicPluginListingDetail> = {},
): PublicPluginListingDetail {
  return {
    id: 'listing-plugin-1',
    title: 'Text Uppercase Plugin',
    summary: 'Converts text to uppercase.',
    tags: ['plugin', 'text'],
    coverImageUrl: null,
    category: 'content',
    useCount: 10,
    avgRating: '4.0',
    reviewCount: 1,
    publishedAt: '2026-03-15T00:00:00.000Z',
    author: { displayName: 'Plugin Author' },
    listingType: 'plugin',
    pricingModel: 'per_execution',
    pricePerExecution: '0.01',
    plugin: {
      pluginId: 'text-uppercase',
      name: 'Text Uppercase',
      version: '1.0.0',
      author: 'Plugin Author',
      description: 'Converts text to uppercase',
      license: 'MIT',
    },
    reviews: [],
    ...overrides,
  }
}

const { MarketplaceDetailDialog } = await import('../MarketplaceDetailDialog')

describe('MarketplaceDetailDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    detailQueryMock.data = makeListingDetail()
    detailQueryMock.isLoading = false
    detailQueryMock.isError = false
    reviewsQueryMock.data = {
      data: detailQueryMock.data.reviews,
      meta: {
        total: detailQueryMock.data.reviews.length,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    }
    reviewsQueryMock.isLoading = false
    reviewsQueryMock.isError = false
    reviewsQueryMock.refetch = vi.fn()
  })

  it('renders detail content, rating, preview, and reviews', () => {
    render(
      <MarketplaceDetailDialog
        listingId="listing-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('marketplace-detail-dialog')).toBeInTheDocument()
    expect(screen.getByText('Agent Workflow')).toBeInTheDocument()
    expect(
      screen.getByText('A detailed workflow summary for marketplace preview.'),
    ).toBeInTheDocument()
    expect(screen.getByText('作者：酒狐')).toBeInTheDocument()
    expect(screen.getByText('42 次安装')).toBeInTheDocument()
    expect(screen.getByText('4.5')).toBeInTheDocument()
    expect(screen.getByTestId('marketplace-preview')).toBeInTheDocument()
    expect(screen.getByTestId('reactflow-preview')).toHaveAttribute(
      'data-fit-view',
      'true',
    )
    expect(screen.getByTestId('reactflow-preview')).toHaveAttribute(
      'data-nodes-draggable',
      'false',
    )
    expect(screen.getByTestId('review-list')).toBeInTheDocument()
    expect(screen.getByText('Great workflow!')).toBeInTheDocument()
    expect(screen.getByTestId('review-form')).toBeInTheDocument()
  })

  it('opens the install dialog from the primary CTA', () => {
    render(
      <MarketplaceDetailDialog
        listingId="listing-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '安装到工作区' }))

    expect(screen.getByTestId('marketplace-install-dialog')).toBeInTheDocument()
    expect(screen.getByText('Install: Agent Workflow')).toBeInTheDocument()
    expect(screen.getByTestId('marketplace-install-dialog')).toHaveAttribute(
      'data-listing-type',
      'workflow',
    )
  })

  it('renders plugin detail with plugin metadata instead of workflow preview', () => {
    const pluginDetail = makePluginListingDetail()
    detailQueryMock.data = pluginDetail
    reviewsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    }

    render(
      <MarketplaceDetailDialog
        listingId="listing-plugin-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Text Uppercase Plugin')).toBeInTheDocument()
    expect(screen.queryByTestId('marketplace-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reactflow-preview')).not.toBeInTheDocument()
    expect(screen.getByText('插件信息')).toBeInTheDocument()
    expect(screen.getByText('text-uppercase')).toBeInTheDocument()
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('$0.01/次')).toBeInTheDocument()
  })

  it('passes listingType to install dialog for plugin listings', () => {
    const pluginDetail = makePluginListingDetail()
    detailQueryMock.data = pluginDetail
    reviewsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    }

    render(
      <MarketplaceDetailDialog
        listingId="listing-plugin-1"
        open={true}
        onOpenChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '安装到工作区' }))

    expect(screen.getByTestId('marketplace-install-dialog')).toHaveAttribute(
      'data-listing-type',
      'plugin',
    )
  })
})
