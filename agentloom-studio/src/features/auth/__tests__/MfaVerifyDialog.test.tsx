import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MfaVerifyDialog } from '../components/MfaVerifyDialog';

const mockVerifyTotp = vi.fn();
const mockClearError = vi.fn();
let mockError: string | null = null;

vi.mock('../hooks/useMfa', () => ({
  useMfa: () => ({
    verifyTotp: mockVerifyTotp,
    isLoading: false,
    error: mockError,
    clearError: mockClearError,
  }),
}));

describe('MfaVerifyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockError = null;
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('显示验证码输入界面', () => {
    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('两步验证')).toBeInTheDocument();
    expect(screen.getByText(/请输入身份验证器应用中的/)).toBeInTheDocument();
    expect(
      screen.getByTestId('mfa-verify-code-input'),
    ).toBeInTheDocument();

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');
    expect(inputs).toHaveLength(6);
  });

  it('输入 6 位验证码后提交验证', async () => {
    mockVerifyTotp.mockResolvedValue(undefined);
    const onSuccess = vi.fn();

    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');

    const digits = '654321'.split('');
    for (let i = 0; i < digits.length; i++) {
      fireEvent.change(inputs[i]!, { target: { value: digits[i] } });
    }

    const submitButton = screen.getByRole('button', { name: '验证' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockVerifyTotp).toHaveBeenCalledWith('factor-123', '654321');
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('验证成功后显示成功界面', async () => {
    mockVerifyTotp.mockResolvedValue(undefined);

    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');

    '123456'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i]!, { target: { value: d } });
    });

    fireEvent.click(screen.getByRole('button', { name: '验证' }));

    await waitFor(() => {
      expect(screen.getByText('验证成功')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '继续' })).toBeInTheDocument();
  });

  it('open=false 时不渲染', () => {
    const { container } = render(
      <MfaVerifyDialog
        open={false}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('点击取消按钮调用 onClose', () => {
    const onClose = vi.fn();

    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('验证码不满 6 位时按钮禁用', () => {
    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');

    '123'.split('').forEach((d, i) => {
      fireEvent.change(inputs[i]!, { target: { value: d } });
    });

    const submitButton = screen.getByRole('button', { name: '验证' });
    expect(submitButton).toBeDisabled();
  });

  it('只接受数字输入', () => {
    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');

    fireEvent.change(inputs[0]!, { target: { value: 'a' } });
    expect(inputs[0]).toHaveValue('');

    fireEvent.change(inputs[0]!, { target: { value: '5' } });
    expect(inputs[0]).toHaveValue('5');
  });

  it('退格键导航到前一个输入框', () => {
    render(
      <MfaVerifyDialog
        open={true}
        factorId="factor-123"
        onClose={vi.fn()}
      />,
    );

    const inputs = screen
      .getByTestId('mfa-verify-code-input')
      .querySelectorAll('input');

    fireEvent.change(inputs[0]!, { target: { value: '1' } });
    fireEvent.change(inputs[1]!, { target: { value: '2' } });

    fireEvent.change(inputs[1]!, { target: { value: '' } });
    fireEvent.keyDown(inputs[1]!, { key: 'Backspace' });

    expect(document.activeElement).toBe(inputs[0]);
  });
});
