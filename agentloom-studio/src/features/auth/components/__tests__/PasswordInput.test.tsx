import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PasswordInput } from '../PasswordInput';

describe('PasswordInput', () => {
  it('默认渲染为 password 类型', () => {
    render(<PasswordInput data-testid="pw" />);

    const input = screen.getByTestId('pw');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('点击切换按钮后变为 text 类型', () => {
    render(<PasswordInput data-testid="pw" />);

    const input = screen.getByTestId('pw');
    const toggleBtn = screen.getByLabelText('显示密码');

    fireEvent.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByLabelText('隐藏密码');
    fireEvent.click(hideBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('error 状态时应用 border-error 样式', () => {
    render(<PasswordInput data-testid="pw" error />);

    const input = screen.getByTestId('pw');
    expect(input.className).toContain('border-error');
  });

  it('非 error 状态时应用 border-input 样式', () => {
    render(<PasswordInput data-testid="pw" />);

    const input = screen.getByTestId('pw');
    expect(input.className).toContain('border-input');
  });

  it('支持 ref 转发', () => {
    const ref = vi.fn();
    render(<PasswordInput ref={ref} />);
    expect(ref).toHaveBeenCalled();
  });

  it('传递原生 input props (placeholder, disabled)', () => {
    render(
      <PasswordInput
        data-testid="pw"
        placeholder="输入密码"
        disabled
      />,
    );

    const input = screen.getByTestId('pw');
    expect(input).toHaveAttribute('placeholder', '输入密码');
    expect(input).toBeDisabled();
  });
});
