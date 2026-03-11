import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { TemplateWizardDialog } from './TemplateWizardDialog';
import type { TemplateDetail } from '../types';

// Mock @xyflow/react (static preview)
vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: Record<string, unknown>) => (
    <div data-testid="reactflow-preview" data-fit-view={props.fitView} data-nodes-draggable={props.nodesDraggable} data-nodes-connectable={props.nodesConnectable} data-elements-selectable={props.elementsSelectable} data-pan-on-drag={props.panOnDrag} data-zoom-on-scroll={props.zoomOnScroll}>
      {(props.children as React.ReactNode) ?? null}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => <div data-testid="reactflow-background" />,
  BackgroundVariant: { Dots: 'dots' },
}));

// Radix Dialog mock (same pattern as CreateVersionDialog.test.tsx)
vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react');
  const {
    Fragment,
    createContext,
    useContext,
    cloneElement,
    isValidElement,
  } = React;

  const DialogContext = createContext<{
    onOpenChange?: (open: boolean) => void;
  } | null>(null);

  function Root({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }) {
    if (!open) return null;
    return React.createElement(
      DialogContext.Provider,
      { value: { onOpenChange } },
      children,
    );
  }

  function Portal({ children }: { children?: React.ReactNode }) {
    return React.createElement(Fragment, null, children);
  }

  function Overlay(props: Record<string, unknown>) {
    return React.createElement('div', props);
  }

  function Content(props: Record<string, unknown>) {
    return React.createElement('div', { role: 'dialog', ...props });
  }

  function Title(props: Record<string, unknown>) {
    return React.createElement('h2', props);
  }

  function Description(props: Record<string, unknown>) {
    return React.createElement('p', props);
  }

  type CloseChildProps = {
    onClick?: React.MouseEventHandler;
  };

  function Close({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: React.ReactNode;
  }) {
    const ctx = useContext(DialogContext);
    const onOpenChange = ctx?.onOpenChange;

    if (asChild && isValidElement<CloseChildProps>(children)) {
      const child = children;
      return cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          child.props.onClick?.(event);
          onOpenChange?.(false);
        },
      });
    }

    return React.createElement(
      'button',
      { type: 'button', onClick: () => onOpenChange?.(false) },
      children,
    );
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close };
});

const mutateAsyncMock = vi.fn();
const navigateMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/features/workflow', () => ({
  useCreateWorkflow: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

function makeTemplateDetail(
  overrides?: Partial<TemplateDetail>,
): TemplateDetail {
  return {
    id: 'tpl-1',
    slug: 'test-template',
    name: '竞品分析',
    description: '分析竞争对手产品',
    category: 'analysis',
    tags: ['test'],
    thumbnailUrl: null,
    metadata: {
      complexity: 'intermediate',
      nodeCount: 3,
    },
    displayOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    definition: {
      nodes: [
        { id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'n2', position: { x: 200, y: 0 }, data: { label: 'Process' } },
        { id: 'n3', position: { x: 400, y: 0 }, data: { label: 'End' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    ...overrides,
  };
}

describe('TemplateWizardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('关闭时不渲染内容', () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('打开时渲染标题和表单', () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('从模板创建工作流')).toBeInTheDocument();
    expect(screen.getByLabelText('工作流名称')).toBeInTheDocument();
    expect(screen.getByText('创建工作流')).toBeInTheDocument();
  });

  it('名称字段预填模板名称的副本', () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText('工作流名称');
    expect(nameInput).toHaveValue('竞品分析的副本');
  });

  it('显示模板预览信息（节点数、连线数、复杂度）', () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('3 个节点')).toBeInTheDocument();
    expect(screen.getByText('2 条连线')).toBeInTheDocument();
    expect(screen.getByText('中级')).toBeInTheDocument();
  });

  it('渲染只读 ReactFlow 预览', () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const preview = screen.getByTestId('reactflow-preview');
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveAttribute('data-fit-view', 'true');
    expect(preview).toHaveAttribute('data-nodes-draggable', 'false');
    expect(preview).toHaveAttribute('data-nodes-connectable', 'false');
    expect(preview).toHaveAttribute('data-elements-selectable', 'false');
    expect(preview).toHaveAttribute('data-pan-on-drag', 'false');
    expect(preview).toHaveAttribute('data-zoom-on-scroll', 'false');
  });

  it('提交表单创建工作流并导航', async () => {
    mutateAsyncMock.mockResolvedValue({ id: 'wf-new', name: '竞品分析的副本' });
    const onOpenChange = vi.fn();

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByText('创建工作流'));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        name: '竞品分析的副本',
        description: '分析竞争对手产品',
        templateSlug: 'test-template',
      });
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/workflows/$workflowId',
        params: { workflowId: 'wf-new' },
      });
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: '工作流已创建' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('创建失败时显示错误 toast', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('Server error'));

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('创建工作流'));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '创建失败',
          variant: 'destructive',
        }),
      );
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('点击取消关闭对话框', () => {
    const onOpenChange = vi.fn();

    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(screen.getByText('取消'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('空名称时校验失败不提交', async () => {
    render(
      <TemplateWizardDialog
        template={makeTemplateDetail()}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText('工作流名称');
    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('创建工作流'));

    await waitFor(() => {
      expect(screen.getByText('请输入工作流名称')).toBeInTheDocument();
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });
});
