import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
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

describe("AppSidebar", () => {
  it("默认不渲染开发者导航入口", () => {
    render(<AppSidebar />);

    expect(screen.getByText("工作流")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("发现")).toBeInTheDocument();
    expect(screen.queryByText("开发者")).not.toBeInTheDocument();
  });
});
