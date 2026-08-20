import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    it('草稿状态显示全部操作按钮', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="draft" />);

      expect(screen.getByTestId('btn-create-version')).toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.getByTestId('btn-publish')).toBeInTheDocument();
      expect(screen.getByTestId('btn-archive')).toBeInTheDocument();
    });

    it('已发布状态隐藏发布按钮', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="published" />);

      expect(screen.getByTestId('btn-create-version')).toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-archive')).toBeInTheDocument();
    });

    it('已归档状态只显示版本历史按钮', () => {
      render(<VersionToolbar {...defaultProps} workflowStatus="archived" />);

      expect(screen.queryByTestId('btn-create-version')).not.toBeInTheDocument();
      expect(screen.getByTestId('btn-version-history')).toBeInTheDocument();
      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-archive')).not.toBeInTheDocument();
    });

    it('提供 onToggleInputSchema 时显示输入参数按钮', () => {
      render(<VersionToolbar {...defaultProps} onToggleInputSchema={vi.fn()} />);

      expect(screen.getByTestId('btn-input-schema')).toBeInTheDocument();
      expect(screen.getByTestId('btn-input-schema')).toHaveTextContent('输入参数');
    });
  });

  describe('按钮交互', () => {
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

    it('点击归档打开归档对话框', () => {
      render(<VersionToolbar {...defaultProps} />);

      expect(screen.queryByTestId('mock-archive-dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('btn-archive'));
      expect(screen.getByTestId('mock-archive-dialog')).toBeInTheDocument();
    });

    it('点击输入参数按钮调用 onToggleInputSchema，并在打开时显示隐藏文案', () => {
      const onToggleInputSchema = vi.fn();
      const { rerender } = render(
        <VersionToolbar {...defaultProps} onToggleInputSchema={onToggleInputSchema} />,
      );

      fireEvent.click(screen.getByTestId('btn-input-schema'));
      expect(onToggleInputSchema).toHaveBeenCalled();

      rerender(
        <VersionToolbar
          {...defaultProps}
          onToggleInputSchema={onToggleInputSchema}
          isInputSchemaOpen
        />,
      );

      expect(screen.getByTestId('btn-input-schema')).toHaveTextContent('隐藏输入参数');
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
