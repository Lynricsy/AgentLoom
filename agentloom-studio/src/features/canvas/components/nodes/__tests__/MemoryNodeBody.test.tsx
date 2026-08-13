import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryNodeBody } from '../MemoryNodeBody';

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
  describe('configured state', () => {
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

  describe('unconfigured state', () => {
    it('renders "未配置" when no memoryInstanceId', () => {
      render(
        <MemoryNodeBody
          config={{ role: 'primary', fusionPriority: 1 }}
        />,
      );

      expect(screen.getByTestId('memory-node-body')).toBeInTheDocument();
      expect(screen.getByTestId('memory-instance-name')).toHaveTextContent(
        '未配置',
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
