import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adaptModelEntityToInfo,
  type CreateLlmModelInput,
  type LlmModelConfigEntity,
  type LlmProviderEntity,
} from "../types";
import { LlmModelConfigPanel } from "./LlmModelConfigPanel";

const mocks = vi.hoisted(() => ({
  useLlmModels: vi.fn(),
  useLlmProviders: vi.fn(),
  useCreateLlmModel: vi.fn(),
  useUpdateLlmModel: vi.fn(),
  useUpdateProvider: vi.fn(),
  notify: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  updateProviderMutateAsync: vi.fn(),
}));

vi.mock("../hooks/useLlmModels", () => ({
  useLlmModels: mocks.useLlmModels,
  useLlmProviders: mocks.useLlmProviders,
  useCreateLlmModel: mocks.useCreateLlmModel,
  useUpdateLlmModel: mocks.useUpdateLlmModel,
  useUpdateProvider: mocks.useUpdateProvider,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({
    notify: mocks.notify,
  }),
}));

const MOCK_PROVIDER: LlmProviderEntity = {
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
  apiKeyId: null,
  sortOrder: 0,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-03-01T00:00:00Z",
};

const DISABLED_PROVIDER: LlmProviderEntity = {
  ...MOCK_PROVIDER,
  id: "prov-anthropic-uuid",
  slug: "anthropic",
  name: "Anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  apiProtocol: "anthropic",
  isEnabled: false,
};

function createLlmModelEntity(
  overrides: Partial<LlmModelConfigEntity> = {},
): LlmModelConfigEntity {
  return {
    id: "cfg-1",
    orgId: "org-id",
    tenantId: "tenant-id",
    providerId: MOCK_PROVIDER.id,
    name: "OpenAI 主模型",
    modelId: "gpt-4o",
    modelType: "chat",
    isEnabled: true,
    isDefault: false,
    capabilities: {},
    contextWindow: null,
    maxOutputTokens: null,
    pricing: null,
    parameters: {
      temperature: 0.7,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: [],
    },
    metadataSource: null,
    embeddingDimensions: null,
    timeoutMs: null,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    provider: MOCK_PROVIDER,
    ...overrides,
  };
}

describe("LlmModelConfigPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useLlmModels.mockReturnValue({
      data: [adaptModelEntityToInfo(createLlmModelEntity())],
      isLoading: false,
      error: null,
    });
    mocks.useLlmProviders.mockReturnValue({
      data: [MOCK_PROVIDER],
      error: null,
    });
    mocks.useCreateLlmModel.mockReturnValue({
      mutateAsync: mocks.createMutateAsync,
      isPending: false,
      error: null,
    });
    mocks.useUpdateLlmModel.mockReturnValue({
      mutateAsync: mocks.updateMutateAsync,
      isPending: false,
      error: null,
    });
    mocks.useUpdateProvider.mockReturnValue({
      mutateAsync: mocks.updateProviderMutateAsync,
      isPending: false,
      error: null,
    });
  });

  it("选择已有配置时立即写回节点 patch", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<LlmModelConfigPanel config={null} onApply={onApply} />);

    await user.click(screen.getByRole("button", { name: "选择已有配置" }));
    await user.click(screen.getByRole("combobox", { name: "已保存配置" }));
    await user.click(screen.getByRole("option", { name: /OpenAI 主模型/i }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          llmConfigId: "cfg-1",
          provider: "openai",
          modelName: "gpt-4o",
          name: "OpenAI 主模型",
        }),
        llmConfigId: "cfg-1",
        modelId: "gpt-4o",
        name: "OpenAI 主模型",
        provider: "openai",
        modelName: "gpt-4o",
        apiKeyId: null,
        isDefault: false,
        parameters: {
          temperature: 0.7,
          maxTokens: undefined,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stop: [],
        },
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        label: "gpt-4o",
      }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "已应用模型配置",
        variant: "success",
      }),
    );
  });

  it("已有配置选择器不会展示禁用的 provider 或模型", async () => {
    const user = userEvent.setup();

    mocks.useLlmModels.mockReturnValue({
      data: [
        adaptModelEntityToInfo(createLlmModelEntity()),
        adaptModelEntityToInfo(
          createLlmModelEntity({
            id: "cfg-disabled-model",
            name: "Disabled GPT-4o",
            modelId: "gpt-4o-disabled",
            isEnabled: false,
          }),
        ),
        adaptModelEntityToInfo(
          createLlmModelEntity({
            id: "cfg-disabled-provider",
            providerId: DISABLED_PROVIDER.id,
            name: "Claude Sonnet",
            modelId: "claude-sonnet-4",
            provider: DISABLED_PROVIDER,
          }),
        ),
      ],
      isLoading: false,
      error: null,
    });
    mocks.useLlmProviders.mockReturnValue({
      data: [MOCK_PROVIDER, DISABLED_PROVIDER],
      error: null,
    });

    render(<LlmModelConfigPanel config={null} onApply={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "选择已有配置" }));
    await user.click(screen.getByRole("combobox", { name: "已保存配置" }));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("OpenAI")).toBeInTheDocument();
    expect(within(listbox).queryByText("Anthropic")).not.toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: /Disabled GPT-4o/i }),
    ).not.toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: /Claude Sonnet/i }),
    ).not.toBeInTheDocument();
  });

  it("创建新配置后调用 create mutation 并写回节点 patch", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const savedModel = createLlmModelEntity({
      id: "cfg-2",
      name: "新建 OpenAI 配置",
    });

    mocks.createMutateAsync.mockResolvedValue(savedModel);

    render(<LlmModelConfigPanel config={null} onApply={onApply} />);

    await user.clear(screen.getByPlaceholderText("例如：OpenAI 主模型"));
    await user.type(
      screen.getByPlaceholderText("例如：OpenAI 主模型"),
      "新建 OpenAI 配置",
    );
    await user.click(screen.getByRole("button", { name: "保存并应用新配置" }));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({
        name: "新建 OpenAI 配置",
        providerId: MOCK_PROVIDER.id,
        modelId: "gpt-4o",
        modelType: "chat",
        parameters: {
          temperature: 0.7,
          maxTokens: undefined,
          topP: 1,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stop: [],
        },
        isDefault: false,
        timeoutMs: undefined,
      } satisfies CreateLlmModelInput);
    });

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          llmConfigId: "cfg-2",
          provider: "openai",
          modelName: "gpt-4o",
          name: "新建 OpenAI 配置",
        }),
        llmConfigId: "cfg-2",
        modelId: "gpt-4o",
        name: "新建 OpenAI 配置",
        provider: "openai",
        modelName: "gpt-4o",
        apiKeyId: null,
        isDefault: false,
        parameters: savedModel.parameters,
        temperature: 0.7,
        maxTokens: undefined,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        label: "gpt-4o",
      }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "LLM 配置已保存",
        variant: "success",
      }),
    );
  });
});
