import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPORT_SCHEMA_VERSION } from '../lib/blockExportImport';
import { BlockImportDialog } from './BlockImportDialog';

vi.mock('@radix-ui/react-dialog', async () => {
  const React = await import('react');
  const { Fragment, createContext, useContext, cloneElement, isValidElement } =
    React;

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
      { onClick: () => onOpenChange?.(false), type: 'button' },
      children,
    );
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close };
});

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../api/blockQueries', () => ({
  useCreateBlock: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

function makeValidFile() {
  return new File(
    [
      JSON.stringify({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: '2026-03-14T12:00:00.000Z',
        block: {
          name: '导入块',
          description: '导入描述',
          category: 'analysis',
          tags: ['demo'],
          definition: {
            nodes: [
              {
                id: 'node-1',
                type: 'llm-agent',
                position: { x: 0, y: 0 },
                data: { label: '节点 1' },
              },
            ],
            edges: [],
            inputPorts: [
              { id: 'input-1', label: '输入', dataType: 'text' },
            ],
            outputPorts: [
              { id: 'output-1', label: '输出', dataType: 'json' },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
          },
          metadata: {
            nodeCount: 1,
            version: 1,
          },
        },
      }),
    ],
    'valid.agentloom-block.json',
    { type: 'application/json' },
  );
}

describe('BlockImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue({ id: 'block-1' });
  });

  it('renders file input', () => {
    render(
      <BlockImportDialog
        onImportSuccess={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
      />,
    );

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

    expect(fileInput).toBeInTheDocument();
    expect(fileInput.type).toBe('file');
    expect(fileInput.accept).toContain('.json');
  });

  it('shows validation errors for invalid file', async () => {
    const user = userEvent.setup();

    render(
      <BlockImportDialog
        onImportSuccess={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
      />,
    );

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
    const invalidFile = new File(
      [
        JSON.stringify({
          schemaVersion: EXPORT_SCHEMA_VERSION,
          exportedAt: '2026-03-14T12:00:00.000Z',
          block: {
            name: '   ',
            description: null,
            category: 'analysis',
            tags: [],
            definition: {
              nodes: [],
              edges: [],
              inputPorts: [],
              outputPorts: [],
            },
            metadata: null,
          },
        }),
      ],
      'invalid.agentloom-block.json',
      { type: 'application/json' },
    );

    await user.upload(fileInput, invalidFile);

    await waitFor(() => {
      expect(screen.getByTestId('validation-errors')).toBeInTheDocument();
    });

    expect(screen.getByText('block.name 不能为空。')).toBeInTheDocument();
    expect(
      screen.getByText('block.definition.nodes 必须是非空数组。'),
    ).toBeInTheDocument();
  });

  it('shows block preview for valid file', async () => {
    const user = userEvent.setup();

    render(
      <BlockImportDialog
        onImportSuccess={vi.fn()}
        onOpenChange={vi.fn()}
        open={true}
      />,
    );

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

    await user.upload(fileInput, makeValidFile());

    await waitFor(() => {
      expect(screen.getByTestId('block-preview')).toBeInTheDocument();
    });

    const preview = within(screen.getByTestId('block-preview'));

    expect(
      preview.getByRole('heading', { name: '导入块' }),
    ).toBeInTheDocument();
    expect(preview.getByText('导入描述')).toBeInTheDocument();
    expect(preview.getByText('1 个节点')).toBeInTheDocument();
  });

  it('calls create mutation on import', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onImportSuccess = vi.fn();

    render(
      <BlockImportDialog
        onImportSuccess={onImportSuccess}
        onOpenChange={onOpenChange}
        open={true}
      />,
    );

    const fileInput = screen.getByTestId('file-input') as HTMLInputElement;

    await user.upload(fileInput, makeValidFile());

    await waitFor(() => {
      expect(screen.getByTestId('block-preview')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: '导入块' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        name: '导入块',
        description: '导入描述',
        category: 'analysis',
        tags: ['demo'],
        definition: {
          nodes: [
            {
              id: 'node-1',
              type: 'llm-agent',
              position: { x: 0, y: 0 },
              data: { label: '节点 1' },
            },
          ],
          edges: [],
          inputPorts: [{ id: 'input-1', label: '输入', dataType: 'text' }],
          outputPorts: [{ id: 'output-1', label: '输出', dataType: 'json' }],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
        metadata: {
          nodeCount: 1,
          version: 1,
        },
      });
    });

    expect(onImportSuccess).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
