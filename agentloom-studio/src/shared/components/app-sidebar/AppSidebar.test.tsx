import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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
import { NAV_GROUPS } from "./navigation";

describe("AppSidebar", () => {
  it("渲染全部导航分组与其条目", () => {
    render(<AppSidebar />);

    for (const group of NAV_GROUPS) {
      expect(screen.getByText(group.label)).toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByText(item.label)).toBeInTheDocument();
      }
    }
  });

  it("开发者控制台入口常驻可达", () => {
    render(<AppSidebar />);

    expect(screen.getByText("开发者").closest("a")).toHaveAttribute(
      "href",
      "/developer-console/earnings",
    );
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
