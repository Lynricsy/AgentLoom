import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryNodeBody } from '../MemoryNodeBody';

const mocks = vi.hoisted(() => ({
  useViewport: vi.fn().mockReturnValue({ zoom: 1.0 }),
}));

vi.mock('@xyflow/react', () => ({
  useViewport: mocks.useViewport,
}));

function createMemoryConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    memoryInstanceId: 'inst-001',
    memoryInstanceName: 'Conversation Memory',
    role: 'primary',
    fusionPriority: 3,
    ...overrides,
  };
}

describe('MemoryNodeBody', () => {
  beforeEach(() => {
    mocks.useViewport.mockReturnValue({ zoom: 1.0 });
  });

  describe('high zoom (>= 0.7)', () => {
    it('renders icon, instance name, role badge, and priority', () => {
      render(<MemoryNodeBody config={createMemoryConfig()} />);

      expect(screen.getByTestId('memory-node-body')).toBeInTheDocument();
      expect(screen.getByTestId('memory-instance-name')).toHaveTextContent(
        'Conversation Memory',
      );
      expect(screen.getByTestId('memory-role-badge')).toHaveTextContent(
        'primary',
      );
      expect(screen.getByTestId('memory-priority')).toHaveTextContent('P3');
    });

    it('renders readonly role badge', () => {
      render(
        <MemoryNodeBody config={createMemoryConfig({ role: 'readonly' })} />,
      );

      expect(screen.getByTestId('memory-role-badge')).toHaveTextContent(
        'readonly',
      );
    });

    it('uses label when memoryInstanceName is absent', () => {
      render(
        <MemoryNodeBody
          config={createMemoryConfig({
            memoryInstanceName: undefined,
            label: 'My Memory',
          })}
        />,
      );

      expect(screen.getByTestId('memory-instance-name')).toHaveTextContent(
        'My Memory',
      );
    });
  });

  describe('medium zoom (0.4 - 0.7)', () => {
    beforeEach(() => {
      mocks.useViewport.mockReturnValue({ zoom: 0.5 });
    });

    it('renders icon and instance name but not role badge or priority', () => {
      render(<MemoryNodeBody config={createMemoryConfig()} />);

      expect(screen.getByTestId('memory-node-body')).toBeInTheDocument();
      expect(screen.getByTestId('memory-instance-name')).toBeInTheDocument();
      expect(
        screen.queryByTestId('memory-role-badge'),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('memory-priority')).not.toBeInTheDocument();
    });
  });

  describe('low zoom (< 0.4)', () => {
    beforeEach(() => {
      mocks.useViewport.mockReturnValue({ zoom: 0.2 });
    });

    it('renders only icon and Memory label', () => {
      render(<MemoryNodeBody config={createMemoryConfig()} />);

      expect(screen.getByTestId('memory-node-body')).toBeInTheDocument();
      expect(screen.getByText('Memory')).toBeInTheDocument();
      expect(
        screen.queryByTestId('memory-instance-name'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('memory-role-badge'),
      ).not.toBeInTheDocument();
    });
  });

  describe('unconfigured state', () => {
    it('renders "Not configured" at high zoom when no memoryInstanceId', () => {
      render(
        <MemoryNodeBody
          config={{ role: 'primary', fusionPriority: 1 }}
        />,
      );

      expect(screen.getByTestId('memory-node-body')).toBeInTheDocument();
      expect(screen.getByTestId('memory-instance-name')).toHaveTextContent(
        'Not configured',
      );
    });

    it('defaults fusionPriority to 1 when missing', () => {
      render(
        <MemoryNodeBody
          config={createMemoryConfig({ fusionPriority: undefined })}
        />,
      );

      expect(screen.getByTestId('memory-priority')).toHaveTextContent('P1');
    });
  });
});
