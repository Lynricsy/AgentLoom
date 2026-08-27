import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOrganization: vi.fn(),
  navigate: vi.fn(),
  refreshAndCheckTenant: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/features/auth", () => ({
  AuthLayout: ({
    children,
    title,
  }: {
    children: ReactNode;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
  useAuthStore: {
    getState: () => ({
      refreshAndCheckTenant: mocks.refreshAndCheckTenant,
    }),
  },
}));

vi.mock("../api", () => ({
  createOrganization: mocks.createOrganization,
}));

import { OnboardingWizard } from "./OnboardingWizard";

async function reachPreferencesStep() {
  const user = userEvent.setup();
  render(<OnboardingWizard />);

  await user.click(screen.getByRole("button", { name: "开始设置" }));
  await user.type(await screen.findByLabelText("组织名称"), "Acme Team");
  await user.click(screen.getByRole("button", { name: "创建组织" }));

  expect(await screen.findByRole("heading", { name: "偏好设置" })).toBeInTheDocument();
  expect(
    await screen.findByRole("button", { name: "完成设置" }),
  ).toBeInTheDocument();
  expect(mocks.createOrganization).toHaveBeenCalledWith("Acme Team");
  expect(mocks.refreshAndCheckTenant).toHaveBeenCalledOnce();
  expect(mocks.navigate).not.toHaveBeenCalled();

  return user;
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOrganization.mockResolvedValue({ data: { id: "org-1" } });
    mocks.refreshAndCheckTenant.mockResolvedValue({
      success: true,
      tenantId: "tenant-1",
    });
  });

  it("组织创建成功后渲染第 3 步，完成偏好设置后才导航首页", async () => {
    const user = await reachPreferencesStep();

    await user.click(screen.getByRole("button", { name: "完成设置" }));

    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("组织创建成功后渲染第 3 步，跳过偏好设置后才导航首页", async () => {
    const user = await reachPreferencesStep();

    await user.click(screen.getByRole("button", { name: "跳过" }));

    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/" });
  });
});
