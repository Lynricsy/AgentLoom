import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArchiveDialog } from './ArchiveDialog';

// ── mocks ──────────────────────────────────────────────

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../api/versionMutations', () => ({
  useArchiveWorkflow: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}));

// ── helpers ────────────────────────────────────────────

const defaultProps = {
  open: true,
  workflowId: 'wf-001',
  onOpenChange: vi.fn(),
};

// ── tests ──────────────────────────────────────────────

describe('ArchiveDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('打开时渲染确认对话框', () => {
    render(<ArchiveDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: '确认归档' })).toBeInTheDocument();
    expect(screen.getByText(/归档后工作流将变为只读/)).toBeInTheDocument();
    expect(screen.getByText(/此操作不可撤销/)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-archive')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-archive')).toBeInTheDocument();
  });

  it('关闭时不渲染内容', () => {
    render(<ArchiveDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('heading', { name: '确认归档' })).not.toBeInTheDocument();
  });

  it('点击取消调用 onOpenChange(false)', () => {
    render(<ArchiveDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('cancel-archive'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('点击确认调用归档并通知成功', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<ArchiveDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('confirm-archive'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '归档成功' }),
      );
    });

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('归档失败时显示错误通知', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('归档失败'));

    render(<ArchiveDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('confirm-archive'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });
});
