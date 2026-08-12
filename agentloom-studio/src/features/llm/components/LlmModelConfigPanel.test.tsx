import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adaptModelEntityToInfo,
  type CreateLlmModelInput,
  type LlmModelConfig,
  type LlmModelConfigEntity,
  type LlmProviderEntity,
} from "../types";
import type * as LlmTypes from "../types";
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
  // 渲染探针状态：见下方 ../types mock
  parseCalls: { count: 0 },
  renderBudget: { value: Number.POSITIVE_INFINITY },
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

// 渲染探针：LlmModelConfigPanel 每渲染一次就会调用一次 parseLlmModelConfig，
// 因此调用次数即渲染次数。超出预算时直接抛错熔断 —— 无限重渲染会占满事件
// 循环，vitest 的 testTimeout 此时不会生效，只能靠探针自己中断。
vi.mock("../types", async (importOriginal) => {
  const actual = await importOriginal<typeof LlmTypes>();

  return {
    ...actual,
    parseLlmModelConfig: (value: unknown) => {
      mocks.parseCalls.count += 1;

      if (mocks.parseCalls.count > mocks.renderBudget.value) {
        throw new Error(
          `LlmModelConfigPanel 渲染次数超过 ${mocks.renderBudget.value} 次，判定为无限重渲染`,
        );
      }

      return actual.parseLlmModelConfig(value);
    },
  };
});

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

function createLlmModelConfig(
  overrides: Partial<LlmModelConfig> = {},
): LlmModelConfig {
  return {
    llmConfigId: "cfg-1",
    name: "OpenAI 主模型",
    provider: "openai",
    modelType: "chat",
    modelName: "gpt-4o",
    parameters: {
      temperature: 0.7,
      maxTokens: undefined,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: [],
    },
    apiKeyId: null,
    embeddingDimensions: null,
    isDefault: false,
    endpointUrl: null,
    authMethod: null,
    authConfig: null,
    timeoutMs: null,
    ...overrides,
  };
}

const CUSTOM_CONFIG_PARAMETERS = {
  temperature: 0.3,
  maxTokens: 2048,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: ["END"],
} as const;

describe("LlmModelConfigPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseCalls.count = 0;
    // 兜底熔断：任何用例都不允许无限重渲染把事件循环占满（届时 testTimeout 失效）。
    mocks.renderBudget.value = 400;
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

  it("非空 config 首屏渲染不会陷入无限重渲染", () => {
    mocks.renderBudget.value = 30;

    render(
      <LlmModelConfigPanel config={createLlmModelConfig()} onApply={vi.fn()} />,
    );

    // 带 llmConfigId 的配置应停在「选择已有配置」并回显既有配置摘要
    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("未绑定")).toBeInTheDocument();
    // 稳定化生效后，config 引用不变时不应重复解析
    expect(mocks.parseCalls.count).toBeLessThanOrEqual(5);
  });

  it("父级每次渲染都传入新 config 对象时不会无限重渲染", () => {
    mocks.renderBudget.value = 30;

    // 画布 customPanelRegistry 就是每次渲染现算 parseLlmModelConfig(node.data)，
    // 因此这里模拟「内容相同但引用每次都新」的父级。
    const { rerender } = render(
      <LlmModelConfigPanel config={createLlmModelConfig()} onApply={vi.fn()} />,
    );

    rerender(
      <LlmModelConfigPanel config={createLlmModelConfig()} onApply={vi.fn()} />,
    );

    expect(screen.getByText("未绑定")).toBeInTheDocument();
    expect(mocks.parseCalls.count).toBeLessThanOrEqual(10);
  });

  it("父级重渲染传入内容相同的新 config 时不会冲掉用户草稿", async () => {
    const user = userEvent.setup();
    // 面板在画布里是常驻挂载的，父级因无关状态重渲染时必须保住未提交的编辑内容。
    const buildConfig = () =>
      createLlmModelConfig({ llmConfigId: null, name: "自定义 GPT 配置" });

    const { rerender } = render(
      <LlmModelConfigPanel config={buildConfig()} onApply={vi.fn()} />,
    );

    const nameInput = screen.getByPlaceholderText("例如：OpenAI 主模型");
    await user.clear(nameInput);
    await user.type(nameInput, "草稿中的名称");

    rerender(<LlmModelConfigPanel config={buildConfig()} onApply={vi.fn()} />);

    expect(nameInput).toHaveValue("草稿中的名称");
  });

  it("非空 config 无 llmConfigId 时在创建表单回显既有参数", () => {
    mocks.renderBudget.value = 30;

    render(
      <LlmModelConfigPanel
        config={createLlmModelConfig({
          llmConfigId: null,
          name: "自定义 GPT 配置",
          parameters: { ...CUSTOM_CONFIG_PARAMETERS, stop: ["END"] },
        })}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("例如：OpenAI 主模型")).toHaveValue(
      "自定义 GPT 配置",
    );
    expect(screen.getByPlaceholderText("留空表示使用模型默认值")).toHaveValue(
      2048,
    );
    expect(screen.getByText("0.3")).toBeInTheDocument();
    expect(screen.getByText("END")).toBeInTheDocument();
  });

  it("非空 config 回显的参数会随创建提交一并写回节点", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const savedModel = createLlmModelEntity({
      id: "cfg-3",
      name: "自定义 GPT 配置",
    });

    mocks.createMutateAsync.mockResolvedValue(savedModel);

    render(
      <LlmModelConfigPanel
        config={createLlmModelConfig({
          llmConfigId: null,
          name: "自定义 GPT 配置",
          parameters: { ...CUSTOM_CONFIG_PARAMETERS, stop: ["END"] },
        })}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "保存并应用新配置" }));

    await waitFor(() => {
      expect(mocks.createMutateAsync).toHaveBeenCalledWith({
        name: "自定义 GPT 配置",
        providerId: MOCK_PROVIDER.id,
        modelId: "gpt-4o",
        modelType: "chat",
        parameters: {
          temperature: 0.3,
          maxTokens: 2048,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          stop: ["END"],
        },
        isDefault: false,
        timeoutMs: undefined,
      } satisfies CreateLlmModelInput);
    });

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ llmConfigId: "cfg-3" }),
    );
  });
});
