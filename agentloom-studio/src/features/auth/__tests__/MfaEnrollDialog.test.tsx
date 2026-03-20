import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MfaEnrollDialog } from '../components/MfaEnrollDialog';

const mockEnrollTotp = vi.fn();
const mockVerifyTotp = vi.fn();
const mockClearError = vi.fn();

vi.mock('../hooks/useMfa', () => ({
  useMfa: () => ({
    enrollTotp: mockEnrollTotp,
    verifyTotp: mockVerifyTotp,
    isLoading: false,
    error: null,
    clearError: mockClearError,
  }),
}));

describe('MfaEnrollDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  it('打开后调用 enrollTotp 并显示 QR 码', async () => {
    mockEnrollTotp.mockResolvedValue({
      factorId: 'factor-123',
      totpUri: 'otpauth://totp/test?secret=ABC',
      qrCode: 'data:image/svg+xml;base64,QRCODE',
      secret: 'ABCDEF',
    });

    render(
      <MfaEnrollDialog open={true} onClose={vi.fn()} />,
    );

    await waitFor(() => {
      expect(mockEnrollTotp).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mfa-qr-code')).toBeInTheDocument();
    });

    const qrImg = screen.getByTestId('mfa-qr-code');
    expect(qrImg).toHaveAttribute(
      'src',
      'data:image/svg+xml;base64,QRCODE',
    );

    expect(screen.getByTestId('mfa-secret-key')).toHaveTextContent('ABCDEF');
  });

  it('输入 6 位验证码后可提交验证', async () => {
    mockEnrollTotp.mockResolvedValue({
      factorId: 'factor-123',
      totpUri: 'otpauth://totp/test?secret=ABC',
      qrCode: 'data:image/svg+xml;base64,QRCODE',
      secret: 'ABCDEF',
    });
    mockVerifyTotp.mockResolvedValue(undefined);

    const onSuccess = vi.fn();
    render(
      <MfaEnrollDialog open={true} onClose={vi.fn()} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mfa-code-input')).toBeInTheDocument();
    });

    const inputs = screen.getByTestId('mfa-code-input').querySelectorAll('input');
    expect(inputs).toHaveLength(6);

    const digits = '123456'.split('');
    for (let i = 0; i < digits.length; i++) {
      fireEvent.change(inputs[i]!, { target: { value: digits[i] } });
    }

    const submitButton = screen.getByRole('button', { name: '确认绑定' });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockVerifyTotp).toHaveBeenCalledWith('factor-123', '123456');
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('open=false 时不渲染', () => {
    const { container } = render(
      <MfaEnrollDialog open={false} onClose={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('点击关闭按钮调用 onClose', async () => {
    mockEnrollTotp.mockResolvedValue({
      factorId: 'factor-123',
      totpUri: 'otpauth://totp/test?secret=ABC',
      qrCode: 'data:image/svg+xml;base64,QRCODE',
      secret: 'ABCDEF',
    });

    const onClose = vi.fn();
    render(<MfaEnrollDialog open={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByTestId('mfa-qr-code')).toBeInTheDocument();
    });

    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});
