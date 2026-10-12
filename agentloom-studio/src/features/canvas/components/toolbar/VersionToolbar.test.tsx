import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCanvasStore } from '../../stores/canvasStore';
import { VersionToolbar } from './VersionToolbar';

vi.mock('@/features/workflow', () => ({
  CreateVersionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-create-version-dialog">CreateVersionDialog</div> : null,
  ArchiveDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-archive-dialog">ArchiveDialog</div> : null,
}));

const defaultProps = {
  workflowId: 'wf-001',
  workflowStatus: 'draft' as const,
  onOpenVersionHistory: vi.fn(),
  onOpenPublish: vi.fn(),
};

describe('VersionToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('状态徽章', () => {
    it('草稿状态显示草稿徽章', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="draft" />);

      const badge = screen.getByTestId('workflow-status-badge');
      expect(badge).toHaveTextContent('草稿');
    });

    it('已发布状态显示已发布徽章', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="published" />);

      const badge = screen.getByTestId('workflow-status-badge');
      expect(badge).toHaveTextContent('已发布');
    });

    it('已归档状态显示已归档徽章', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="archived" />);

      const badge = screen.getByTestId('workflow-status-badge');
      expect(badge).toHaveTextContent('已归档');
    });
  });

  describe('按钮可见性', () => {
    it('草稿状态显示全部操作按钮', async () => {
      const user = userEvent.setup();
      render(<VersionToolbar {...defaultProps} workflowStatus="draft" />);

      expect(screen.getByTestId('btn-create-version')).toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.getByTestId('btn-publish')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '更多操作' }));
      expect(await screen.findByTestId('btn-archive')).toBeInTheDocument();
    });

    it('已发布状态隐藏发布按钮', async () => {
      const user = userEvent.setup();
      render(<VersionToolbar {...defaultProps} workflowStatus="published" />);

      expect(screen.getByTestId('btn-create-version')).toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '更多操作' }));
      expect(await screen.findByTestId('btn-archive')).toBeInTheDocument();
    });

    it('已归档状态只显示版本历史按钮', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="archived" />);

      expect(screen.queryByTestId('btn-create-version')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '更多操作' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-archive')).not.toBeInTheDocument();
    });

    it('打开更多操作后菜单含导出、导入、分享、归档四项', async () => {
      const user = userEvent.setup();
      render(
        <VersionToolbar
          {...defaultProps}
          workflowStatus="published"
          hasNodes
          onExport={vi.fn()}
          onImport={vi.fn()}
          onShare={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('btn-export-workflow')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: '更多操作' }));

      const items = await screen.findAllByRole('menuitem');
      expect(items.map((item) => item.textContent)).toEqual(['导出', '导入', '分享', '归档']);
      expect(screen.getByTestId('btn-export-workflow')).toBeInTheDocument();
      expect(screen.getByTestId('btn-import-workflow')).toBeInTheDocument();
      expect(screen.getByTestId('btn-share-workflow')).toBeInTheDocument();
      expect(screen.getByTestId('btn-archive')).toBeInTheDocument();
    });

    it('提供 onToggleInputSchema 时显示输入参数按钮', () => {
      render(<VersionToolbar {...defaultProps} onToggleInputSchema={vi.fn()} />);

      expect(screen.getByTestId('btn-input-schema')).toBeInTheDocument();
      expect(screen.getByTestId('btn-input-schema')).toHaveTextContent('输入参数');
    });
  });

  describe('按钮交互', () => {
    it('撤销/重做按钮随历史栈启用，点击后回退和恢复画布', () => {
      act(() => useCanvasStore.getState().actions.reset());
      render(<VersionToolbar {...defaultProps} />);
      const undoButton = screen.getByRole('button', { name: '撤销' });
      const redoButton = screen.getByRole('button', { name: '重做' });
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeDisabled();

      act(() =>
        useCanvasStore.getState().actions.addNode({
          id: 'text-1',
          nodeType: 'text',
          category: 'output',
          position: { x: 0, y: 0 },
          label: 'Text',
        }),
      );
      expect(undoButton).toBeEnabled();

      fireEvent.click(undoButton);
      expect(useCanvasStore.getState().nodes).toHaveLength(0);
      expect(undoButton).toBeDisabled();
      expect(redoButton).toBeEnabled();

      fireEvent.click(redoButton);
      expect(useCanvasStore.getState().nodes).toHaveLength(1);
    });

    it('点击版本历史调用 onOpenVersionHistory', () => {
      render(<VersionToolbar {...defaultProps} />);

      fireEvent.click(screen.getByTestId('btn-version-history'));
      expect(defaultProps.onOpenVersionHistory).toHaveBeenCalled();
    });

    it('点击保存版本打开创建对话框', () => {
      render(<VersionToolbar {...defaultProps} />);

      expect(screen.queryByTestId('mock-create-version-dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('btn-create-version'));
      expect(screen.getByTestId('mock-create-version-dialog')).toBeInTheDocument();
    });

    it('点击发布调用页面级发布回调', () => {
      render(<VersionToolbar {...defaultProps} />);

      fireEvent.click(screen.getByTestId('btn-publish'));
      expect(defaultProps.onOpenPublish).toHaveBeenCalledWith();
    });

    it('点击归档打开归档对话框', async () => {
      const user = userEvent.setup();
      render(<VersionToolbar {...defaultProps} />);

      expect(screen.queryByTestId('mock-archive-dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '更多操作' }));
      await user.click(await screen.findByRole('menuitem', { name: '归档' }));
      expect(screen.getByTestId('mock-archive-dialog')).toBeInTheDocument();
    });

    it.each([
      ['导出', 'onExport'],
      ['导入', 'onImport'],
      ['分享', 'onShare'],
    ] as const)('通过更多操作菜单点击「%s」调用 %s', async (label, callbackName) => {
      const user = userEvent.setup();
      const callbacks = { onExport: vi.fn(), onImport: vi.fn(), onShare: vi.fn() };
      render(
        <VersionToolbar
          {...defaultProps}
          workflowStatus="published"
          hasNodes
          {...callbacks}
        />,
      );

      await user.click(screen.getByRole('button', { name: '更多操作' }));
      await user.click(await screen.findByRole('menuitem', { name: label }));
      expect(callbacks[callbackName]).toHaveBeenCalledTimes(1);
    });

    it('点击输入参数按钮调用 onToggleInputSchema，并在打开时以 aria-pressed 表达开启态', () => {
      const onToggleInputSchema = vi.fn();
      const { rerender } = render(
        <VersionToolbar {...defaultProps} onToggleInputSchema={onToggleInputSchema} />,
      );

      const button = screen.getByTestId('btn-input-schema');
      expect(button).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(button);
      expect(onToggleInputSchema).toHaveBeenCalled();

      rerender(
        <VersionToolbar
          {...defaultProps}
          onToggleInputSchema={onToggleInputSchema}
          isInputSchemaOpen
        />,
      );

      expect(screen.getByTestId('btn-input-schema')).toHaveTextContent('输入参数');
      expect(screen.getByTestId('btn-input-schema')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('运行按钮', () => {
    it('提供 onRun 时显示运行按钮', () => {
      const onRun = vi.fn();
      render(<VersionToolbar {...defaultProps} onRun={onRun} />);

      const runBtn = screen.getByTestId('btn-run-workflow');
      expect(runBtn).toBeInTheDocument();
      expect(runBtn).toHaveTextContent('运行');
    });

    it('未提供 onRun 时不显示运行按钮', () => {
      render(<VersionToolbar {...defaultProps} />);

      expect(screen.queryByTestId('btn-run-workflow')).not.toBeInTheDocument();
    });

    it('点击运行按钮调用 onRun', () => {
      const onRun = vi.fn();
      render(<VersionToolbar {...defaultProps} onRun={onRun} />);

      fireEvent.click(screen.getByTestId('btn-run-workflow'));
      expect(onRun).toHaveBeenCalled();
    });

    it('isRunning 为 true 时运行按钮显示执行中且禁用', () => {
      const onRun = vi.fn();
      render(<VersionToolbar {...defaultProps} onRun={onRun} isRunning />);

      const runBtn = screen.getByTestId('btn-run-workflow');
      expect(runBtn).toBeDisabled();
      expect(runBtn).toHaveTextContent('执行中');
    });

    it('已归档状态不显示运行按钮', () => {
      const onRun = vi.fn();
      render(<VersionToolbar {...defaultProps} workflowStatus="archived" onRun={onRun} />);

      expect(screen.queryByTestId('btn-run-workflow')).not.toBeInTheDocument();
    });
  });
});
