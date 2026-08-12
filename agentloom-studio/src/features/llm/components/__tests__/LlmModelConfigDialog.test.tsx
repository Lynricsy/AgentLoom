import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmProviderEntity } from "../../types";

const mocks = vi.hoisted(() => ({
  useLlmProviders: vi.fn(),
  useCreateLlmModel: vi.fn(),
  useUpdateLlmModel: vi.fn(),
  useUpdateProvider: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  updateProviderMutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../../hooks/useLlmModels", () => ({
  useLlmProviders: mocks.useLlmProviders,
  useCreateLlmModel: mocks.useCreateLlmModel,
  useUpdateLlmModel: mocks.useUpdateLlmModel,
  useUpdateProvider: mocks.useUpdateProvider,
  usePrivateCloudModels: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
  useTestPrivateCloudConnection: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ notify: mocks.notify }),
}));

import { LlmModelConfigDialog } from "../LlmModelConfigDialog";

const OPENAI_PROVIDER: LlmProviderEntity = {
  id: "prov-openai-uuid",
  orgId: "org-id",
  tenantId: "tenant-id",
  slug: "openai",
  name: "OpenAI",
  iconUrl: null,
  baseUrl: null,
  defaultBaseUrl: "https://api.openai.com",
  isBuiltin: true,
  isEnabled: true,
  apiProtocol: "openai_responses",
  apiKeyId: "key-openai",
  sortOrder: 0,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

describe("LlmModelConfigDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useLlmProviders.mockReturnValue({ data: [OPENAI_PROVIDER] });
    mocks.useCreateLlmModel.mockReturnValue({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
    });
    mocks.useUpdateLlmModel.mockReturnValue({
      mutateAsync: mocks.updateMutateAsync,
      isPending: false,
    });
    mocks.useUpdateProvider.mockReturnValue({
      mutateAsync: mocks.updateProviderMutateAsync,
      isPending: false,
    });
  });

  // 迁移到 Radix Select 后，「切 provider → 整组模型选项与 modelName 同帧替换」
  // 是最容易出错的一条链路：选项集合换了但受控值没跟上就会退回 placeholder。
  it("切换 provider 后模型选择器同步切到该 provider 的首个模型", async () => {
    // provider 列表未加载时回退到静态目录，此时切换 provider 会带出整组新模型
    mocks.useLlmProviders.mockReturnValue({ data: [] });
    const user = userEvent.setup();

    render(
      <LlmModelConfigDialog open onOpenChange={vi.fn()} editingModel={null} />,
    );

    expect(screen.getByRole("combobox", { name: "模型" })).toHaveTextContent(
      "gpt-4o",
    );

    await user.click(screen.getByRole("combobox", { name: "提供商" }));
    await user.click(screen.getByRole("option", { name: "Anthropic" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "模型" })).toHaveTextContent(
        "claude-3.5-sonnet",
      );
    });
    expect(
      screen.getByRole("combobox", { name: "模型" }),
    ).not.toHaveTextContent("请选择模型");
  });

  it("提交时带上所选 provider 与模型", async () => {
    const user = userEvent.setup();

    render(
      <LlmModelConfigDialog open onOpenChange={vi.fn()} editingModel={null} />,
    );

    const nameInput = screen.getByPlaceholderText("例如：GPT-4o 主配置");
    await user.clear(nameInput);
    await user.type(nameInput, "主力模型");
    await user.click(screen.getByRole("button", { name: "创建配置" }));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "主力模型",
          providerId: OPENAI_PROVIDER.id,
          modelId: "gpt-4o",
          modelType: "chat",
        }),
      );
    });
  });
});
