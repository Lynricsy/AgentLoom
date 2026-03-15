import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { MyMarketplaceListingItem } from '../../types';

const { listingsQueryMock, unlistMock, relistMock, notifyMock } = vi.hoisted(
  () => ({
    listingsQueryMock: {
      data: undefined as unknown,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    },
    unlistMock: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    relistMock: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    notifyMock: vi.fn(),
  }),
);

vi.mock('../../api/marketplaceQueries', () => ({
  useMyMarketplaceListings: () => listingsQueryMock,
}));

vi.mock('../../api/marketplaceMutations', () => ({
  useUnlistMarketplaceListing: () => unlistMock,
  useRelistMarketplaceListing: () => relistMock,
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}));

vi.mock('@/shared/components/Pagination', () => ({
  Pagination: ({
    page,
    totalPages,
    onPageChange,
  }: {
    page: number;
    totalPages: number;
    onPageChange: (p: number) => void;
  }) => (
    <div data-testid="pagination">
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)}>Next</button>
    </div>
  ),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function makeListing(
  overrides: Partial<MyMarketplaceListingItem> = {},
): MyMarketplaceListingItem {
  return {
    id: 'listing-1',
    workflowVersionId: 'version-1',
    tenantId: 'tenant-1',
    title: 'Test Workflow Template',
    summary: 'A test workflow for automated tasks and processes.',
    tags: ['agent', 'automation'],
    coverImageUrl: null,
    status: 'listed' as const,
    submittedBy: 'user-1',
    submittedAt: '2026-03-01T00:00:00Z',
    publishedAt: '2026-03-01T00:00:00Z',
    unlistedAt: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    workflowDefinitionId: 'def-1',
    workflowName: 'My Workflow',
    versionNumber: 1,
    reviewResult: null,
    ...overrides,
  };
}

const { MyMarketplaceListingsPage } = await import(
  '../MyMarketplaceListingsPage'
);

describe('MyMarketplaceListingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listingsQueryMock.data = undefined;
    listingsQueryMock.isLoading = false;
    listingsQueryMock.isError = false;
    listingsQueryMock.error = null;
    listingsQueryMock.refetch = vi.fn();
    unlistMock.mutateAsync = vi.fn();
    unlistMock.isPending = false;
    relistMock.mutateAsync = vi.fn();
    relistMock.isPending = false;
  });

  it('renders the page wrapper with data-testid', () => {
    listingsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(
      screen.getByTestId('my-marketplace-listings-page'),
    ).toBeInTheDocument();
    expect(screen.getByText('我的市场发布')).toBeInTheDocument();
  });

  it('shows 6 loading skeleton items when isLoading is true', () => {
    listingsQueryMock.isLoading = true;
    renderWithProviders(<MyMarketplaceListingsPage />);
    const skeletons = document
      .querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(6);
  });

  it('shows error state with retry button when isError is true', () => {
    listingsQueryMock.isError = true;
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.getByText('加载失败')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '重试' }),
    ).toBeInTheDocument();
  });

  it('calls refetch when retry button is clicked in error state', async () => {
    const user = userEvent.setup();
    listingsQueryMock.isError = true;
    renderWithProviders(<MyMarketplaceListingsPage />);
    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(listingsQueryMock.refetch).toHaveBeenCalledOnce();
  });

  it('shows empty state "暂无发布记录" when data has no items', () => {
    listingsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.getByText('暂无发布记录')).toBeInTheDocument();
  });

  it('renders listing cards when data has items', () => {
    listingsQueryMock.data = {
      data: [
        makeListing({ id: 'listing-1', title: 'First Template' }),
        makeListing({ id: 'listing-2', title: 'Second Template' }),
      ],
      meta: { total: 2, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.getAllByTestId('listing-card')).toHaveLength(2);
    expect(screen.getByText('First Template')).toBeInTheDocument();
    expect(screen.getByText('Second Template')).toBeInTheDocument();
  });

  it('status filter tabs render all expected options', () => {
    listingsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '已上架' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '审核中' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '审核未通过' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '已下架' }),
    ).toBeInTheDocument();
  });

  it('clicking a status filter tab changes the active tab', async () => {
    const user = userEvent.setup();
    listingsQueryMock.data = {
      data: [],
      meta: { total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);

    const listedTab = screen.getByRole('button', { name: '已上架' });
    const allTab = screen.getByRole('button', { name: '全部' });
    expect(allTab.className).toContain('bg-primary');

    await user.click(listedTab);
    expect(listedTab.className).toContain('bg-primary');
    expect(allTab.className).not.toContain('bg-primary');
  });

  it('unlist flow: clicking 下架 opens confirm dialog and confirming calls mutateAsync', async () => {
    const user = userEvent.setup();
    unlistMock.mutateAsync.mockResolvedValue({ data: makeListing({ status: 'unlisted' }) });

    listingsQueryMock.data = {
      data: [makeListing({ id: 'listing-1', status: 'listed' })],
      meta: { total: 1, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);

    await user.click(
      within(screen.getByTestId('listing-card')).getByRole('button', {
        name: /下架/,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('unlist-confirm-dialog'),
      ).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: '确认下架' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(unlistMock.mutateAsync).toHaveBeenCalledWith('listing-1');
    });
  });

  it('unlist success shows success toast and closes dialog', async () => {
    const user = userEvent.setup();
    unlistMock.mutateAsync.mockResolvedValue({
      data: makeListing({ status: 'unlisted' }),
    });

    listingsQueryMock.data = {
      data: [makeListing({ id: 'listing-1', status: 'listed' })],
      meta: { total: 1, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);

    await user.click(
      within(screen.getByTestId('listing-card')).getByRole('button', {
        name: /下架/,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('unlist-confirm-dialog')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '确认下架' }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '下架成功', variant: 'success' }),
      );
    });
  });

  it('relist flow: clicking 重新上架 calls relistMutation and shows success toast', async () => {
    const user = userEvent.setup();
    relistMock.mutateAsync.mockResolvedValue({
      data: makeListing({ status: 'listed' }),
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-01T00:00:00Z',
      },
    });

    listingsQueryMock.data = {
      data: [makeListing({ id: 'listing-1', status: 'unlisted' })],
      meta: { total: 1, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);

    await user.click(screen.getByRole('button', { name: /重新上架/ }));

    await waitFor(() => {
      expect(relistMock.mutateAsync).toHaveBeenCalledWith('listing-1');
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '重新上架成功',
          variant: 'success',
        }),
      );
    });
  });

  it('view review: clicking 查看审核结果 opens review result dialog', async () => {
    const user = userEvent.setup();

    listingsQueryMock.data = {
      data: [
        makeListing({
          id: 'listing-1',
          status: 'review_failed',
          title: 'Failed Listing',
          reviewResult: {
            outcome: 'failed',
            checks: [
              {
                code: 'TITLE_INVALID',
                status: 'failed',
                message: '标题不符合要求',
                fixHint: '请修改标题',
              },
              {
                code: 'WORKFLOW_EMPTY_NODE_DETECTED',
                status: 'passed',
                message: '节点检测通过',
              },
            ],
            reviewedAt: '2026-03-01T00:00:00Z',
          },
        }),
      ],
      meta: { total: 1, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);

    await user.click(screen.getByRole('button', { name: /查看审核结果/ }));

    await waitFor(() => {
      expect(
        screen.getByTestId('review-result-dialog'),
      ).toBeInTheDocument();
    });

    const dialog = screen.getByTestId('review-result-dialog');
    expect(within(dialog).getByText('审核结果')).toBeInTheDocument();
    expect(within(dialog).getByText('Failed Listing')).toBeInTheDocument();
    expect(within(dialog).getByText('标题不符合要求')).toBeInTheDocument();
    expect(within(dialog).getByText(/💡.*请修改标题/)).toBeInTheDocument();
    expect(within(dialog).getByText(/节点检测通过/)).toBeInTheDocument();
  });

  it('pagination renders when totalPages > 1 and shows correct page info', () => {
    listingsQueryMock.data = {
      data: [makeListing({ id: 'listing-1' })],
      meta: { total: 25, page: 1, pageSize: 12, totalPages: 3 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('pagination does not render when totalPages <= 1', () => {
    listingsQueryMock.data = {
      data: [makeListing({ id: 'listing-1' })],
      meta: { total: 5, page: 1, pageSize: 12, totalPages: 1 },
    };
    renderWithProviders(<MyMarketplaceListingsPage />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });
});
