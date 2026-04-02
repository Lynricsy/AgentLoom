import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmModelInfo, LlmProviderEntity } from "../../types";
import { GlobalModelSelector } from "../GlobalModelSelector";

const mocks = vi.hoisted(() => ({
  useLlmModels: vi.fn(),
  useLlmProviders: vi.fn(),
}));

vi.mock("../../hooks/useLlmModels", () => ({
  useLlmModels: mocks.useLlmModels,
  useLlmProviders: mocks.useLlmProviders,
}));

const OPENAI_PROVIDER: LlmProviderEntity = {
  id: "provider-openai",
  orgId: "org-1",
  tenantId: "tenant-1",
  slug: "openai",
  name: "OpenAI",
  iconUrl: null,
  baseUrl: null,
  defaultBaseUrl: "https://api.openai.com",
  isBuiltin: true,
  isEnabled: true,
  apiProtocol: "openai_responses",
  apiKeyId: null,
  sortOrder: 1,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const GOOGLE_PROVIDER: LlmProviderEntity = {
  id: "provider-google",
  orgId: "org-1",
  tenantId: "tenant-1",
  slug: "google",
  name: "Google",
  iconUrl: null,
  baseUrl: null,
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  isBuiltin: true,
  isEnabled: true,
  apiProtocol: "google",
  apiKeyId: null,
  sortOrder: 2,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const DISABLED_PROVIDER: LlmProviderEntity = {
  id: "provider-disabled",
  orgId: "org-1",
  tenantId: "tenant-1",
  slug: "anthropic",
  name: "Anthropic",
  iconUrl: null,
  baseUrl: null,
  defaultBaseUrl: "https://api.anthropic.com",
  isBuiltin: true,
  isEnabled: false,
  apiProtocol: "anthropic",
  apiKeyId: null,
  sortOrder: 3,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

function createModelInfo(
  providerEntity: LlmProviderEntity,
  overrides: Partial<LlmModelInfo> = {},
): LlmModelInfo {
  return {
    id: `${providerEntity.slug}-${overrides.modelId ?? "model"}`,
    orgId: providerEntity.orgId,
    tenantId: providerEntity.tenantId,
    providerId: providerEntity.id,
    name: overrides.name ?? `${providerEntity.name} 默认模型`,
    modelId: overrides.modelId ?? `${providerEntity.slug}-model`,
    modelType: overrides.modelType ?? "chat",
    isEnabled: overrides.isEnabled ?? true,
    isDefault: overrides.isDefault ?? false,
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
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    provider: providerEntity.slug,
    providerEntity,
    modelName: overrides.modelId ?? `${providerEntity.slug}-model`,
    ...overrides,
  };
}

describe("GlobalModelSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useLlmProviders.mockReturnValue({
      data: [OPENAI_PROVIDER, GOOGLE_PROVIDER, DISABLED_PROVIDER],
    });
    mocks.useLlmModels.mockReturnValue({
      data: [
        createModelInfo(OPENAI_PROVIDER, {
          id: "model-openai-chat",
          name: "GPT-4o",
          modelId: "gpt-4o",
          isDefault: true,
        }),
        createModelInfo(OPENAI_PROVIDER, {
          id: "model-openai-embedding",
          name: "Text Embedding",
          modelId: "text-embedding-3-large",
          modelType: "embedding",
        }),
        createModelInfo(GOOGLE_PROVIDER, {
          id: "model-google-chat",
          name: "Gemini 2.0 Flash",
          modelId: "gemini-2.0-flash",
        }),
        createModelInfo(GOOGLE_PROVIDER, {
          id: "model-google-disabled",
          name: "Disabled Gemini",
          modelId: "gemini-disabled",
          isEnabled: false,
        }),
        createModelInfo(DISABLED_PROVIDER, {
          id: "model-disabled-provider",
          name: "Claude Sonnet",
          modelId: "claude-sonnet",
        }),
      ],
    });
  });

  it("按 Provider 分组展示已启用聊天模型并带图标", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <GlobalModelSelector
        aria-label="标题生成模型"
        value=""
        onValueChange={onValueChange}
        modelType="chat"
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "标题生成模型" }));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("OpenAI")).toBeInTheDocument();
    expect(within(listbox).getByText("Google")).toBeInTheDocument();
    expect(within(listbox).queryByText("Anthropic")).not.toBeInTheDocument();
    expect(
      within(listbox).queryByText("Text Embedding"),
    ).not.toBeInTheDocument();
    expect(
      within(listbox).queryByText("Disabled Gemini"),
    ).not.toBeInTheDocument();
    expect(
      within(listbox).getByRole("img", { name: "openai" }),
    ).toBeInTheDocument();
    expect(
      within(listbox).getByRole("img", { name: "google" }),
    ).toBeInTheDocument();

    await user.click(within(listbox).getByRole("option", { name: /GPT-4o/i }));
    expect(onValueChange).toHaveBeenCalledWith("model-openai-chat");
  });

  it("当前有值时显示选中模型与 Provider 图标", () => {
    render(
      <GlobalModelSelector
        aria-label="标题生成模型"
        value="model-google-chat"
        onValueChange={vi.fn()}
        modelType="chat"
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "标题生成模型" }),
    ).toHaveTextContent("Gemini 2.0 Flash");
    expect(
      screen.getByRole("combobox", { name: "标题生成模型" }),
    ).toHaveTextContent("(Google)");
    expect(screen.getByRole("img", { name: "google" })).toBeInTheDocument();
  });
});
