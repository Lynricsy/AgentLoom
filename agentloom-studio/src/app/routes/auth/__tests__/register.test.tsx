import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();
const mockSignUp = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  createRoute: vi.fn().mockReturnValue({ options: { path: '/register' } }),
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock('@/app/routes/__root', () => ({
  rootRoute: {},
}));

import { RegisterPage } from '../register';

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({
      data: { user: {}, session: null },
      error: null,
    });
  });

  it('渲染注册表单', () => {
    render(<RegisterPage />);

    expect(screen.getByText('创建账号')).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.getByLabelText('密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByText('返回登录')).toBeInTheDocument();
  });

  it('空表单提交显示验证错误', async () => {
    render(<RegisterPage />);

    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(screen.getByText('请输入有效的邮箱地址')).toBeInTheDocument();
    });

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('弱密码显示 NFR12 校验错误', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(screen.getByText('密码至少 8 个字符')).toBeInTheDocument();
    });

    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('缺少大写字母显示校验错误', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password1' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'password1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(screen.getByText('密码需包含至少一个大写字母')).toBeInTheDocument();
    });
  });

  it('密码不匹配显示确认错误', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'Password456' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(
        screen.getByText('两次输入的密码不一致'),
      ).toBeInTheDocument();
    });
  });

  it('有效表单提交调用 signUp 并导航到登录页', async () => {
    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'fox@ling.plus',
        password: 'Password123',
      });
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/login',
        search: { registered: 'true' },
      });
    });
  });

  it('API 错误时显示 server error', async () => {
    mockSignUp.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(
        screen.getByText('User already registered'),
      ).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('网络异常时显示通用错误', async () => {
    mockSignUp.mockRejectedValue(new Error('network error'));

    render(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'fox@ling.plus' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.change(screen.getByLabelText('确认密码'), {
      target: { value: 'Password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => {
      expect(screen.getByText(/未知错误/)).toBeInTheDocument();
    });
  });

  it('登录链接指向 /login', () => {
    render(<RegisterPage />);

    const loginLink = screen.getByText('返回登录');
    expect(loginLink).toHaveAttribute('href', '/login');
  });
});
