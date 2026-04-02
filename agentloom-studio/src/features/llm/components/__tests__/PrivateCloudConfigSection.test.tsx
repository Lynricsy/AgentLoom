import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ReactNode } from "react";

import type { LlmProviderEntity } from "../../types";
import { PrivateCloudConfigSection } from "../PrivateCloudConfigSection";

const formSchema = z
  .object({
    name: z.string().min(1),
    provider: z.string().min(1),
    modelType: z.string(),
    modelName: z.string(),
    apiKey: z.string(),
    clearApiKey: z.boolean(),
    temperature: z.number(),
    maxTokens: z.string(),
    topP: z.number(),
    frequencyPenalty: z.number(),
    presencePenalty: z.number(),
    stop: z.array(z.string()),
    endpointUrl: z.string().url().optional().or(z.literal("")),
    authMethod: z.enum(["api_key", "mtls", "none"]).optional(),
    authConfig: z.record(z.string(), z.unknown()).optional(),
    timeoutMs: z.number().int().min(5000).max(600000).optional(),
  })
  .superRefine((values, ctx) => {
    if (values.provider !== "private_cloud") {
      return;
    }

    if (!values.endpointUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endpointUrl"],
        message: "请输入私有云端点 URL",
      });
    }

    if (!values.authMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authMethod"],
        message: "请选择认证方式",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

const testConnectionMock = vi.fn();
const fetchModelsMock = vi.fn();

const PROVIDER_WITHOUT_KEY: LlmProviderEntity = {
  id: "provider-private-cloud",
  orgId: "org-id",
  tenantId: "tenant-id",
  slug: "private_cloud",
  name: "Private Cloud",
  iconUrl: null,
  baseUrl: "https://my-vllm:8000/v1",
  defaultBaseUrl: "https://my-vllm:8000/v1",
  isBuiltin: true,
  isEnabled: true,
  apiProtocol: "openai_chat",
  apiKeyId: null,
  sortOrder: 0,
  createdAt: "2026-04-02T00:00:00Z",
  updatedAt: "2026-04-02T00:00:00Z",
};

const PROVIDER_WITH_KEY: LlmProviderEntity = {
  ...PROVIDER_WITHOUT_KEY,
  apiKeyId: "11111111-1111-1111-8111-111111111111",
};

vi.mock("../../hooks/useLlmModels", () => ({
  useTestPrivateCloudConnection: () => ({
    mutateAsync: testConnectionMock,
    isPending: false,
  }),
  usePrivateCloudModels: () => ({
    mutateAsync: fetchModelsMock,
    isPending: false,
  }),
}));

function FormWrapper({
  children,
  defaultValues,
}: {
  children: ReactNode;
  defaultValues?: Partial<FormValues>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as never,
    defaultValues: {
      name: "test",
      provider: "private_cloud",
      modelType: "chat",
      modelName: "",
      apiKey: "",
      clearApiKey: false,
      temperature: 0.7,
      maxTokens: "",
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: [],
      endpointUrl: "",
      authMethod: "none",
      authConfig: {},
      ...defaultValues,
    },
  });

  return <FormProvider {...form}>{children}</FormProvider>;
}

describe("PrivateCloudConfigSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testConnectionMock.mockResolvedValue({
      success: true,
      latencyMs: 42,
      serverInfo: { models: ["llama-3"], version: "0.1.0" },
    });
    fetchModelsMock.mockResolvedValue([
      { id: "llama-3-70b", name: "Llama 3 70B", ownedBy: "meta" },
      { id: "qwen-2.5-72b", name: "Qwen 2.5 72B" },
    ]);
  });

  it("渲染所有基本表单字段", () => {
    render(
      <FormWrapper>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    expect(
      screen.getByTestId("private-cloud-config-section"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("endpoint-url-input")).toBeInTheDocument();
    expect(screen.getByTestId("auth-method-select")).toBeInTheDocument();
    expect(screen.getByTestId("timeout-input")).toBeInTheDocument();
    expect(screen.getByTestId("test-connection-btn")).toBeInTheDocument();
  });

  it("端点 URL 为空时测试连接按钮禁用", () => {
    render(
      <FormWrapper>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    expect(screen.getByTestId("test-connection-btn")).toBeDisabled();
  });

  it("api_key 模式无已存储凭据且未输入 API Key 时禁用连接测试并显示提示", () => {
    render(
      <FormWrapper
        defaultValues={{
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "api_key",
        }}
      >
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    expect(screen.getByTestId("api-key-auth-section")).toBeInTheDocument();
    expect(screen.getByTestId("api-key-input")).toBeInTheDocument();
    expect(screen.getByTestId("test-connection-btn")).toBeDisabled();
    expect(
      screen.getByText("请输入 API Key 以测试连接或获取模型。"),
    ).toBeInTheDocument();
  });

  it("api_key 模式直接输入 API Key 时连接测试携带明文 apiKey", async () => {
    render(
      <FormWrapper
        defaultValues={{
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "api_key",
          apiKey: "sk-direct-input",
        }}
      >
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    fireEvent.click(screen.getByTestId("test-connection-btn"));

    await waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "api_key",
          apiKey: "sk-direct-input",
          apiKeyId: undefined,
        }),
      );
    });
  });

  it("api_key 模式已有受管凭据时可直接复用 apiKeyId 测试连接", async () => {
    render(
      <FormWrapper
        defaultValues={{
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "api_key",
        }}
      >
        <PrivateCloudConfigSection provider={PROVIDER_WITH_KEY} />
      </FormWrapper>,
    );

    expect(screen.getByTestId("test-connection-btn")).toBeEnabled();

    fireEvent.click(screen.getByTestId("test-connection-btn"));

    await waitFor(() => {
      expect(testConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "api_key",
          apiKey: undefined,
          apiKeyId: PROVIDER_WITH_KEY.apiKeyId,
        }),
      );
    });
  });

  it("测试连接成功后显示成功状态、服务器版本和获取模型按钮", async () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: "https://my-vllm:8000/v1" }}>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    fireEvent.click(screen.getByTestId("test-connection-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("connection-status")).toHaveTextContent(
        "连接成功",
      );
      expect(screen.getByTestId("connection-status")).toHaveTextContent("42ms");
      expect(screen.getByTestId("connection-status")).toHaveTextContent(
        "版本 0.1.0",
      );
    });

    expect(screen.getByTestId("fetch-models-btn")).toBeInTheDocument();
  });

  it("获取模型列表后渲染模型选择器并自动选中第一个模型", async () => {
    render(
      <FormWrapper defaultValues={{ endpointUrl: "https://my-vllm:8000/v1" }}>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    fireEvent.click(screen.getByTestId("test-connection-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("fetch-models-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("fetch-models-btn"));

    await waitFor(() => {
      expect(fetchModelsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointUrl: "https://my-vllm:8000/v1",
          authMethod: "none",
        }),
      );
    });

    await waitFor(() => {
      const select = screen.getByTestId(
        "remote-model-select",
      ) as HTMLSelectElement;
      expect(select.value).toBe("llama-3-70b");
    });
  });

  it("选择 mtls 认证方式时显示即将支持提示", () => {
    render(
      <FormWrapper defaultValues={{ authMethod: "mtls" }}>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    expect(screen.getByTestId("mtls-auth-section")).toBeInTheDocument();
    expect(screen.getByTestId("mtls-auth-section")).toHaveTextContent(
      "即将支持",
    );
  });

  it("连接成功但无远程模型时显示手动输入框", async () => {
    fetchModelsMock.mockResolvedValue([]);

    render(
      <FormWrapper defaultValues={{ endpointUrl: "https://my-vllm:8000/v1" }}>
        <PrivateCloudConfigSection provider={PROVIDER_WITHOUT_KEY} />
      </FormWrapper>,
    );

    fireEvent.click(screen.getByTestId("test-connection-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("fetch-models-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("fetch-models-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("manual-model-input")).toBeInTheDocument();
    });
  });
});
