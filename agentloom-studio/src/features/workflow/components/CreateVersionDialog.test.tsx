import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateVersionDialog } from './CreateVersionDialog';

const mutateAsyncMock = vi.fn();
const notifyMock = vi.fn();

vi.mock('../api/versionMutations', () => ({
  useCreateVersion: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: notifyMock }),
}));

const defaultProps = {
  open: true,
  workflowId: 'wf-001',
  onOpenChange: vi.fn(),
};

describe('CreateVersionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('打开时渲染创建表单', () => {
    render(<CreateVersionDialog {...defaultProps} />);

    expect(screen.getByRole('heading', { name: '保存版本' })).toBeInTheDocument();
    expect(screen.getByTestId('version-label-input')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-create-version')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-create-version')).toBeInTheDocument();
  });

  it('关闭时不渲染内容', () => {
    render(<CreateVersionDialog {...defaultProps} open={false} />);

    expect(screen.queryByRole('heading', { name: '保存版本' })).not.toBeInTheDocument();
  });

  it('输入标签后提交', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<CreateVersionDialog {...defaultProps} />);

    const input = screen.getByTestId('version-label-input');
    fireEvent.change(input, { target: { value: '初始版本' } });
    fireEvent.click(screen.getByTestId('confirm-create-version'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({ label: '初始版本' });
    });

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: '版本已保存' }),
      );
    });

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('空标签提交', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<CreateVersionDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('confirm-create-version'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({ label: undefined });
    });
  });

  it('点击取消关闭对话框', () => {
    render(<CreateVersionDialog {...defaultProps} />);

    fireEvent.click(screen.getByTestId('cancel-create-version'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('关闭时清空标签输入', async () => {
    mutateAsyncMock.mockResolvedValueOnce({});

    render(<CreateVersionDialog {...defaultProps} />);

    const input = screen.getByTestId('version-label-input');
    fireEvent.change(input, { target: { value: '测试标签' } });
    expect(input).toHaveValue('测试标签');

    fireEvent.click(screen.getByTestId('confirm-create-version'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});
