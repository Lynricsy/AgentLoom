import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompatibilityPreview } from './CompatibilityPreview';
import type { CompatibilityPreviewProps } from './CompatibilityPreview';

function createProps(
  overrides: Partial<CompatibilityPreviewProps> = {},
): CompatibilityPreviewProps {
  return {
    visible: true,
    x: 100,
    y: 200,
    visualLevel: 'L0',
    reasonKey: null,
    metadata: {},
    ...overrides,
  };
}

describe('CompatibilityPreview', () => {
  it('renders with data-testid', () => {
    render(<CompatibilityPreview {...createProps()} />);
    expect(screen.getByTestId('compatibility-preview')).toBeInTheDocument();
  });

  it('applies --visible class when visible', () => {
    render(<CompatibilityPreview {...createProps({ visible: true })} />);
    const el = screen.getByTestId('compatibility-preview');
    expect(el.className).toContain('compatibility-preview--visible');
  });

  it('does not apply --visible class when hidden', () => {
    render(<CompatibilityPreview {...createProps({ visible: false })} />);
    const el = screen.getByTestId('compatibility-preview');
    expect(el.className).not.toContain('compatibility-preview--visible');
  });

  it('positions with offset from cursor', () => {
    render(<CompatibilityPreview {...createProps({ x: 50, y: 80 })} />);
    const el = screen.getByTestId('compatibility-preview');
    expect(el.style.left).toBe('58px');
    expect(el.style.top).toBe('88px');
  });

  it('shows "完全匹配" for L0', () => {
    render(<CompatibilityPreview {...createProps({ visualLevel: 'L0' })} />);
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '完全匹配',
    );
  });

  it('shows field stats for L1 with metadata', () => {
    render(
      <CompatibilityPreview
        {...createProps({
          visualLevel: 'L1',
          metadata: {
            matchedRequiredCount: 3,
            totalRequiredCount: 5,
            unmappedRequiredCount: 2,
          },
        })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '已匹配 3/5 个必填字段 — 2 个未映射',
    );
  });

  it('shows clean stats when all required fields mapped', () => {
    render(
      <CompatibilityPreview
        {...createProps({
          visualLevel: 'L1',
          metadata: {
            matchedRequiredCount: 4,
            totalRequiredCount: 4,
            unmappedRequiredCount: 0,
          },
        })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '已匹配 4/4 个必填字段',
    );
  });

  it('falls back to reasonKey for L1 without metadata', () => {
    render(
      <CompatibilityPreview
        {...createProps({
          visualLevel: 'L1',
          reasonKey: 'Type coercion available',
          metadata: {},
        })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      'Type coercion available',
    );
  });

  it('shows generic text for L1 without metadata or reasonKey', () => {
    render(
      <CompatibilityPreview
        {...createProps({ visualLevel: 'L1', metadata: {} })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '需要转换',
    );
  });

  it('shows "正在检查兼容性…" for checking', () => {
    render(
      <CompatibilityPreview
        {...createProps({ visualLevel: 'checking' })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '正在检查兼容性…',
    );
  });

  it('shows reasonKey for error level', () => {
    render(
      <CompatibilityPreview
        {...createProps({
          visualLevel: 'error',
          reasonKey: 'Schema mismatch at root.name',
        })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      'Schema mismatch at root.name',
    );
  });

  it('falls back to "不兼容" for error without reasonKey', () => {
    render(
      <CompatibilityPreview
        {...createProps({ visualLevel: 'error' })}
      />,
    );
    expect(screen.getByTestId('compatibility-preview-message')).toHaveTextContent(
      '不兼容',
    );
  });

  it('applies correct level CSS class', () => {
    const { rerender } = render(
      <CompatibilityPreview {...createProps({ visualLevel: 'L0' })} />,
    );
    const root = screen.getByTestId('compatibility-preview');
    const dot = root.querySelector('.compatibility-preview__level');
    expect(dot?.className).toContain('compatibility-preview__level--l0');

    rerender(
      <CompatibilityPreview {...createProps({ visualLevel: 'error' })} />,
    );
    expect(dot?.className).toContain('compatibility-preview__level--error');
  });

  it('has role="tooltip" and aria-hidden when not visible', () => {
    render(<CompatibilityPreview {...createProps({ visible: false })} />);
    const el = screen.getByTestId('compatibility-preview');
    expect(el).toHaveAttribute('role', 'tooltip');
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });
});
