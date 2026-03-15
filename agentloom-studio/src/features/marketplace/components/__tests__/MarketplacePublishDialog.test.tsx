import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MarketplacePublishDialog } from '../MarketplacePublishDialog';
import type { MarketplaceReviewCheck } from '../../types';

// ---------------------------------------------------------------------------
// vi.hoisted mocks – created before module evaluation
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const workflowMock: {
    data: {
      publishedVersionId: string | null;
      name: string;
      status: string;
    } | null;
    isLoading: boolean;
  } = {
    data: {
      publishedVersionId: 'version-123',
      name: 'Test Workflow',
      status: 'published',
    },
    isLoading: false,
  };

  const submitMock = {
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  };

  return { workflowMock, submitMock };
});

vi.mock('@/features/workflow', () => ({
  useWorkflow: () => mocks.workflowMock,
}));

vi.mock('../../api/marketplaceMutations', () => ({
  useSubmitMarketplaceListing: () => mocks.submitMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    ),
  };
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof MarketplacePublishDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const result = renderWithProviders(
    <MarketplacePublishDialog
      open={true}
      onOpenChange={onOpenChange}
      workflowId="workflow-123"
      {...props}
    />,
  );
  return { onOpenChange, ...result };
}

/**
 * Fill in a valid form — title ≥5, summary ≥30 chars, at least 1 tag.
 * The input must already be visible (dialog open=true).
 */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  const titleInput = screen.getByTestId('marketplace-title-input');
  const summaryInput = screen.getByTestId('marketplace-summary-input');
  const tagsInput = screen.getByTestId('marketplace-tags-input');

  await user.click(titleInput);
  await user.type(titleInput, 'Test Workflow Title');

  await user.click(summaryInput);
  await user.type(
    summaryInput,
    'This is a detailed summary describing what the workflow does and why it is useful.',
  );

  // Add one tag via Enter
  await user.click(tagsInput);
  await user.type(tagsInput, 'automation');
  await user.keyboard('{Enter}');
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workflowMock.data = {
    publishedVersionId: 'version-123',
    name: 'Test Workflow',
    status: 'published',
  };
  mocks.submitMock.mutateAsync = vi.fn();
  mocks.submitMock.reset = vi.fn();
  mocks.submitMock.isPending = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MarketplacePublishDialog', () => {
  // ─── Test 1 ──────────────────────────────────────────────────────────────
  it('renders form fields when dialog is open', () => {
    renderDialog();

    expect(
      screen.getByTestId('marketplace-publish-dialog'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketplace-publish-form'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketplace-title-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketplace-summary-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketplace-tags-input'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('marketplace-submit-btn'),
    ).toBeInTheDocument();
  });

  // ─── Test 2 ──────────────────────────────────────────────────────────────
  it('shows warning and disables submit when workflow is not published', () => {
    mocks.workflowMock.data = {
      publishedVersionId: null,
      name: 'Draft Workflow',
      status: 'draft',
    };

    renderDialog();

    expect(
      screen.getByText(
        '工作流尚未发布，请先发布工作流后再提交到市场',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('marketplace-submit-btn')).toBeDisabled();
  });

  // ─── Test 3 ──────────────────────────────────────────────────────────────
  it('does not call mutation and shows validation error when title is empty', async () => {
    const user = userEvent.setup();
    renderDialog();

    const summaryInput = screen.getByTestId('marketplace-summary-input');
    const tagsInput = screen.getByTestId('marketplace-tags-input');

    await user.click(summaryInput);
    await user.type(
      summaryInput,
      'This is a detailed summary describing what the workflow does and why it is useful.',
    );

    await user.click(tagsInput);
    await user.type(tagsInput, 'automation');
    await user.keyboard('{Enter}');

    await user.click(screen.getByTestId('marketplace-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText(/标题至少 5 个字符/)).toBeInTheDocument();
    });
    expect(mocks.submitMock.mutateAsync).not.toHaveBeenCalled();
  });

  // ─── Test 4 ──────────────────────────────────────────────────────────────
  it('calls submitMutation with correct payload on valid submit', async () => {
    const user = userEvent.setup();

    mocks.submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    renderDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('marketplace-submit-btn'));

    await waitFor(() => {
      expect(mocks.submitMock.mutateAsync).toHaveBeenCalledWith({
        workflowVersionId: 'version-123',
        title: 'Test Workflow Title',
        summary:
          'This is a detailed summary describing what the workflow does and why it is useful.',
        tags: ['automation'],
        coverImageUrl: undefined,
      });
    });
  });

  // ─── Test 5 ──────────────────────────────────────────────────────────────
  it('shows success state when review outcome is passed', async () => {
    const user = userEvent.setup();

    mocks.submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    renderDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('marketplace-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('提交成功')).toBeInTheDocument();
      expect(
        screen.getByText('工作流已通过审核并上架市场'),
      ).toBeInTheDocument();
    });
  });

  // ─── Test 6 ──────────────────────────────────────────────────────────────
  it('shows review-failed state with ReviewCheckList when review fails', async () => {
    const user = userEvent.setup();

    const failedChecks: MarketplaceReviewCheck[] = [
      {
        code: 'TITLE_INVALID',
        status: 'failed',
        message: 'Title does not meet requirements',
        fixHint: 'Please use a more descriptive title',
      },
      {
        code: 'RECENT_SUCCESSFUL_EXECUTION_MISSING',
        status: 'failed',
        message: 'No recent successful execution found',
        fixHint: 'Run the workflow at least once successfully',
      },
      {
        code: 'TAGS_INVALID',
        status: 'passed',
        message: 'Tags are valid',
      },
    ];

    mocks.submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: {
        outcome: 'failed',
        checks: failedChecks,
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    renderDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('marketplace-submit-btn'));

    await waitFor(() => {
      expect(
        screen.getByTestId('review-check-list'),
      ).toBeInTheDocument();
    });

    const checkItems = screen.getAllByTestId('review-check-item');
    expect(checkItems).toHaveLength(3);

    // Failed items show their messages
    expect(
      screen.getByText('Title does not meet requirements'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No recent successful execution found'),
    ).toBeInTheDocument();
    // Fix hints are shown
    expect(
      screen.getByText('Please use a more descriptive title'),
    ).toBeInTheDocument();
    // Passed item also shown
    expect(screen.getByText('Tags are valid')).toBeInTheDocument();
  });

  // ─── Test 7 ──────────────────────────────────────────────────────────────
  it('shows conflict state when submission returns a 409 error', async () => {
    const user = userEvent.setup();

    const conflictError = {
      response: { status: 409 },
    };
    mocks.submitMock.mutateAsync.mockRejectedValue(conflictError);

    renderDialog();
    await fillValidForm(user);
    await user.click(screen.getByTestId('marketplace-submit-btn'));

    await waitFor(() => {
      expect(screen.getByText('已存在')).toBeInTheDocument();
      expect(
        screen.getByText('该工作流版本已提交到市场'),
      ).toBeInTheDocument();
    });
  });

  // ─── Test 8 ──────────────────────────────────────────────────────────────
  it('adds tags on Enter and comma, removes last tag on Backspace', async () => {
    const user = userEvent.setup();
    renderDialog();

    const tagsInput = screen.getByTestId('marketplace-tags-input');

    // Add tag via Enter
    await user.click(tagsInput);
    await user.type(tagsInput, 'automation');
    await user.keyboard('{Enter}');

    expect(screen.getByText('automation')).toBeInTheDocument();
    // Input should be cleared after adding tag
    expect(tagsInput).toHaveValue('');

    // Add tag via comma key (fireEvent for reliable keydown simulation)
    await user.type(tagsInput, 'agent');
    fireEvent.keyDown(tagsInput, { key: ',', code: 'Comma' });

    await waitFor(() => {
      expect(screen.getByText('agent')).toBeInTheDocument();
    });

    // Remove last tag via Backspace when input is empty
    // First ensure input is cleared (comma handler sets tagInput='')
    // Then press Backspace
    await user.click(tagsInput);
    await user.keyboard('{Backspace}');

    await waitFor(() => {
      expect(screen.queryByText('agent')).not.toBeInTheDocument();
    });
    // 'automation' tag should still be present
    expect(screen.getByText('automation')).toBeInTheDocument();
  });

  // ─── Test 9 ──────────────────────────────────────────────────────────────
  it('auto-closes dialog after 2 seconds on success', async () => {
    mocks.submitMock.mutateAsync.mockResolvedValue({
      data: {},
      reviewResult: {
        outcome: 'passed',
        checks: [],
        reviewedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    const { onOpenChange } = renderDialog();

    const formUser = userEvent.setup();
    await fillValidForm(formUser);

    vi.useFakeTimers();

    await act(async () => {
      fireEvent.submit(screen.getByTestId('marketplace-publish-form'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('提交成功')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);

    vi.useRealTimers();
  });

  // ─── Test 10 ─────────────────────────────────────────────────────────────
  it('resets form state when dialog is closed and reopened', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MarketplacePublishDialog
          open={true}
          onOpenChange={vi.fn()}
          workflowId="workflow-123"
        />
      </QueryClientProvider>,
    );

    // Type into the title input
    const titleInput = screen.getByTestId('marketplace-title-input');
    await user.click(titleInput);
    await user.type(titleInput, 'My Draft Title');
    expect(titleInput).toHaveValue('My Draft Title');

    // Add a tag
    const tagsInput = screen.getByTestId('marketplace-tags-input');
    await user.click(tagsInput);
    await user.type(tagsInput, 'draft-tag');
    await user.keyboard('{Enter}');
    expect(screen.getByText('draft-tag')).toBeInTheDocument();

    // Close the dialog (open → false)
    rerender(
      <QueryClientProvider client={queryClient}>
        <MarketplacePublishDialog
          open={false}
          onOpenChange={vi.fn()}
          workflowId="workflow-123"
        />
      </QueryClientProvider>,
    );

    // Reopen the dialog (false → true triggers reset useEffect)
    rerender(
      <QueryClientProvider client={queryClient}>
        <MarketplacePublishDialog
          open={true}
          onOpenChange={vi.fn()}
          workflowId="workflow-123"
        />
      </QueryClientProvider>,
    );

    // Form fields and tags should be reset to defaults
    await waitFor(() => {
      expect(screen.getByTestId('marketplace-title-input')).toHaveValue('');
    });
    expect(screen.queryByText('draft-tag')).not.toBeInTheDocument();
    expect(mocks.submitMock.reset).toHaveBeenCalled();
  });
});
