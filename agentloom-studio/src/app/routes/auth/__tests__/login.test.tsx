import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  createRoute: vi.fn().mockReturnValue({ options: { path: "/login" } }),
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

vi.mock("@/shared/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) =>
        mockSignInWithPassword(...args),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

vi.mock("@/app/routes/__root", () => ({
  rootRoute: {},
}));

vi.mock("@/features/auth/components/MfaVerifyDialog", () => ({
  MfaVerifyDialog: ({
    open,
    onClose,
    onSuccess,
  }: {
    open: boolean;
    factorId: string;
    onClose: () => void;
    onSuccess?: () => void;
  }) =>
    open ? (
      <div data-testid="mfa-verify-dialog">
        <span>多因素认证</span>
        <button type="button" onClick={onClose}>
          关闭
        </button>
        <button type="button" onClick={onSuccess}>
          验证成功
        </button>
      </div>
    ) : null,
}));

import { LoginPage } from "../login";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    });
  });

  it("渲染登录表单且默认隐藏 OAuth 按钮", () => {
    render(<LoginPage />);

    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.getByText("登录您的 AgentLoom 账号")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("使用 Google 继续")).not.toBeInTheDocument();
    expect(screen.queryByText("使用 GitHub 继续")).not.toBeInTheDocument();
    expect(screen.getByText("立即注册")).toBeInTheDocument();
  });

  it("空表单提交显示验证错误", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("请输入有效的邮箱地址")).toBeInTheDocument();
      expect(screen.getByText("请输入密码")).toBeInTheDocument();
    });

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("有效表单提交调用 signInWithPassword 并导航到首页", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "fox@ling.plus" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "Password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "fox@ling.plus",
        password: "Password123",
      });
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  });

  it("API 错误时显示 server error", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "fox@ling.plus" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid login credentials")).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("MFA challenge 时显示 MFA 提示", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: { factors: [{ id: "totp-1", type: "totp" }] },
      },
      error: null,
    });

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "fox@ling.plus" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "Password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText(/多因素认证/)).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("网络异常时显示通用错误", async () => {
    mockSignInWithPassword.mockRejectedValue(new Error("network error"));

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "fox@ling.plus" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "Password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByText(/未知错误/)).toBeInTheDocument();
    });
  });

  it("注册链接指向 /register", () => {
    render(<LoginPage />);

    const registerLink = screen.getByText("立即注册");
    expect(registerLink).toHaveAttribute("href", "/register");
  });
});
