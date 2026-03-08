import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VersionToolbar } from './VersionToolbar';

vi.mock('@/features/workflow/components/CreateVersionDialog', () => ({
  CreateVersionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-create-version-dialog">CreateVersionDialog</div> : null,
}));

vi.mock('@/features/workflow/components/ArchiveDialog', () => ({
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
  });
});
