import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateMemoryDialog } from './CreateMemoryDialog';

// --- Mocks ---

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
}));

vi.mock('../hooks/useMemoryInstances', () => ({
  useCreateMemoryInstance: () => ({
    mutateAsync: mocks.mutateAsync,
    reset: mocks.reset,
    isPending: mocks.isPending,
    isError: mocks.isError,
  }),
}));

// --- Tests ---

describe('CreateMemoryDialog', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue({ id: 'new-mi' });
    mocks.isPending = false;
    mocks.isError = false;
  });

  it('当 open=false 时不渲染', () => {
    render(
      <CreateMemoryDialog
        open={false}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('当 open=true 时渲染对话框', () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('新建记忆实例')).toBeInTheDocument();
  });

  it('名称为空时创建按钮禁用', () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    const submitBtn = screen.getByRole('button', { name: '创建' });
    expect(submitBtn).toBeDisabled();
  });

  it('输入名称后创建按钮可用', async () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText('输入记忆实例名称'),
      '新记忆',
    );

    const submitBtn = screen.getByRole('button', { name: '创建' });
    expect(submitBtn).toBeEnabled();
  });

  it('提交表单调用 mutation 并触发 onSuccess', async () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText('输入记忆实例名称'),
      '新记忆实例',
    );
    await userEvent.type(
      screen.getByPlaceholderText('输入描述（可选）'),
      '描述内容',
    );
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: '新记忆实例',
      description: '描述内容',
    });
    expect(onSuccess).toHaveBeenCalledWith('new-mi');
    expect(onClose).toHaveBeenCalled();
  });

  it('点击取消调用 onClose', async () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('点击关闭按钮调用 onClose', async () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await userEvent.click(screen.getByLabelText('关闭'));
    expect(onClose).toHaveBeenCalled();
  });

  it('mutation 错误时显示错误提示', () => {
    mocks.isError = true;
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText('创建失败，请重试')).toBeInTheDocument();
  });

  it('描述为空时 mutation 不包含 description', async () => {
    render(
      <CreateMemoryDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText('输入记忆实例名称'),
      '只有名称',
    );
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: '只有名称',
      description: undefined,
    });
  });
});
