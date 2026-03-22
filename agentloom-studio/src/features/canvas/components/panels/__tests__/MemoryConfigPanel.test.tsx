import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryConfigPanel } from '../MemoryConfigPanel';

const mocks = vi.hoisted(() => ({
  useAllMemoryInstances: vi.fn().mockReturnValue({
    data: [
      {
        id: 'inst-001',
        name: 'Conversation Memory',
        description: 'Stores conversation context',
        status: 'active',
        graphEngine: 'nebula',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'inst-002',
        name: 'Knowledge Graph',
        description: null,
        status: 'active',
        graphEngine: 'neo4j',
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/features/canvas/hooks/useMemoryInstances', () => ({
  useAllMemoryInstances: mocks.useAllMemoryInstances,
}));

function createMemoryConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    memoryInstanceId: 'inst-001',
    memoryInstanceName: 'Conversation Memory',
    role: 'primary',
    fusionPriority: 3,
    bootUris: ['system://boot'],
    ...overrides,
  };
}

describe('MemoryConfigPanel', () => {
  const onApply = vi.fn();
  const onValidationChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAllMemoryInstances.mockReturnValue({
      data: [
        {
          id: 'inst-001',
          name: 'Conversation Memory',
          description: 'Stores conversation context',
          status: 'active',
          graphEngine: 'nebula',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'inst-002',
          name: 'Knowledge Graph',
          description: null,
          status: 'active',
          graphEngine: 'neo4j',
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    });
  });

  it('renders the panel with all form fields', () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(screen.getByTestId('memory-config-panel')).toBeInTheDocument();
    expect(screen.getByTestId('memory-fusion-priority')).toBeInTheDocument();
    expect(screen.getByTestId('boot-uri-tag-input')).toBeInTheDocument();
  });

  it('shows selected instance details when configured', () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(
      screen.getByTestId('memory-instance-details'),
    ).toBeInTheDocument();
    expect(screen.getByText('Conversation Memory')).toBeInTheDocument();
    const detailsCard = screen.getByTestId('memory-instance-details');
    expect(detailsCard).toHaveTextContent('nebula');
  });

  it('shows missing instance warning when selected instance not found', () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig({ memoryInstanceId: 'non-existent' })}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(
      screen.getByTestId('memory-instance-missing-warning'),
    ).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mocks.useAllMemoryInstances.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(
      <MemoryConfigPanel
        config={createMemoryConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(screen.getByText(/加载中/)).toBeInTheDocument();
  });

  it('calls onApply when instance is selected', async () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig({ memoryInstanceId: '' })}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    const instanceSelect = screen.getAllByRole('combobox')[0]!;
    fireEvent.change(instanceSelect, { target: { value: 'inst-002' } });

    await waitFor(() => {
      expect(onApply).toHaveBeenCalled();
    });
  });

  it('calls onApply when role is changed', async () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    const roleSelects = screen.getAllByRole('combobox');
    const roleSelect = roleSelects[1]!;
    fireEvent.change(roleSelect, { target: { value: 'readonly' } });

    await waitFor(() => {
      expect(onApply).toHaveBeenCalled();
    });
  });

  it('renders boot URI tags from config', () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig({
          bootUris: ['system://boot', 'custom://init'],
        })}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(screen.getByText('system://boot')).toBeInTheDocument();
    expect(screen.getByText('custom://init')).toBeInTheDocument();
  });

  it('calls onValidationChange with false when form is valid', async () => {
    render(
      <MemoryConfigPanel
        config={createMemoryConfig()}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    await waitFor(() => {
      expect(onValidationChange).toHaveBeenCalledWith(false);
    });
  });

  it('shows empty state when no instances available', () => {
    mocks.useAllMemoryInstances.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    render(
      <MemoryConfigPanel
        config={createMemoryConfig({ memoryInstanceId: '' })}
        onApply={onApply}
        onValidationChange={onValidationChange}
      />,
    );

    expect(screen.getByText(/no memory instances/i)).toBeInTheDocument();
  });
});
