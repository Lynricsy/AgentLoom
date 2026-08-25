import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "owner" as string | null,
}));

vi.mock("@/features/auth", () => ({
  useAuthToken: () => "token",
}));

vi.mock("@/features/intervention-policy", () => ({
  getInterventionPolicyRoleFromToken: () => mocks.role,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: vi.fn().mockReturnValue({ pathname: "/workflows" }),
}));

vi.mock("@/features/notification", () => ({
  NotificationBell: () => <div data-testid="notification-bell" />,
}));

vi.mock("@/shared/components/brand", () => ({
  BrandMark: () => <div data-testid="brand-mark" />,
}));

vi.mock("./UserMenu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

import { AppSidebar } from "./AppSidebar";
import { filterNavGroupsByRole } from "./navigation";

describe("AppSidebar", () => {
  beforeEach(() => {
    mocks.role = "owner";
  });

  it("渲染当前角色可见的全部导航分组与其条目", () => {
    render(<AppSidebar />);

    for (const group of filterNavGroupsByRole("owner")) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByText(item.label)).toBeInTheDocument();
      }
    }
  });

  it("owner 的开发者入口落在收益页", () => {
    render(<AppSidebar />);

    expect(screen.getByText("开发者").closest("a")).toHaveAttribute(
      "href",
      "/developer-console/earnings",
    );
  });

  it("creator 的开发者入口落在开发者密钥页", () => {
    mocks.role = "creator";
    render(<AppSidebar />);

    expect(screen.getByText("开发者").closest("a")).toHaveAttribute(
      "href",
      "/developer-console/keys",
    );
  });

  it("operator 与 viewer 看不到开发者入口", () => {
    mocks.role = "operator";
    const { unmount } = render(<AppSidebar />);
    expect(screen.queryByText("开发者")).not.toBeInTheDocument();
    unmount();

    mocks.role = "viewer";
    render(<AppSidebar />);
    expect(screen.queryByText("开发者")).not.toBeInTheDocument();
  });

  it("折叠后隐藏文字标签，仅保留图标入口", async () => {
    const user = userEvent.setup();
    render(<AppSidebar />);

    expect(screen.getByText("工作流")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起侧边栏" }));

    expect(screen.queryByText("工作流")).not.toBeInTheDocument();
    // 折叠态下链接仍然存在，只是不显示文字
    expect(
      document.querySelector('a[href="/workflows"]'),
    ).toBeInTheDocument();
  });

  it("折叠分组后隐藏该组条目", async () => {
    const user = userEvent.setup();
    render(<AppSidebar />);

    expect(screen.getByText("沙箱")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /资源/ }));

    expect(screen.queryByText("沙箱")).not.toBeInTheDocument();
    // 其他分组不受影响
    expect(screen.getByText("工作流")).toBeInTheDocument();
  });
});
